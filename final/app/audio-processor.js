// Audio Processor for capturing and encoding audio
class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.playbackContext = null;
    this.mediaStream = null;
    this.audioWorkletNode = null;
    this.sourceNode = null;
    this.analyser = null;
    this.isRecording = false;
    this.onAudioData = null;
    this.onVisualizerData = null;
    this.playbackQueue = [];
    this.isPlaying = false;
    this.nextPlayTime = 0;
  }

  async initialize() {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: CONFIG.SAMPLE_RATE,
          channelCount: CONFIG.CHANNELS,
        }
      });

      // Create audio context (may not honor requested sample rate)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: CONFIG.SAMPLE_RATE,
      });

      console.log('AudioContext sample rate:', this.audioContext.sampleRate);
      console.log('Target sample rate (CONFIG):', CONFIG.SAMPLE_RATE);

      if (this.audioContext.sampleRate !== CONFIG.SAMPLE_RATE) {
        console.warn(`⚠️ Sample rate mismatch! Will resample ${this.audioContext.sampleRate}Hz → ${CONFIG.SAMPLE_RATE}Hz`);
      }

      // Create source node from microphone
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyser for visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.sourceNode.connect(this.analyser);

      // Create script processor for audio capture
      // Note: ScriptProcessor is deprecated but widely supported
      // For production, use AudioWorklet
      this.processor = this.audioContext.createScriptProcessor(CONFIG.BUFFER_SIZE, CONFIG.CHANNELS, CONFIG.CHANNELS);

      let chunkCount = 0;
      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Resample if needed (e.g., 48kHz -> 16kHz)
        let processedData = inputData;
        if (this.audioContext.sampleRate !== CONFIG.SAMPLE_RATE) {
          processedData = this.resample(inputData, this.audioContext.sampleRate, CONFIG.SAMPLE_RATE);
        }

        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = this.floatTo16BitPCM(processedData);

        // Debug logging every 100 chunks
        if (chunkCount % 100 === 0) {
          console.log(`📊 Audio chunk #${chunkCount}: ${pcm16.length} samples`);
        }
        chunkCount++;

        // Send to callback - 11labs handles VAD
        if (this.onAudioData) {
          this.onAudioData(pcm16);
        }
      };

      this.sourceNode.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      console.log('Audio processor initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio:', error);
      throw error;
    }
  }

  startRecording() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isRecording = true;
    console.log('Recording started');
  }

  stopRecording() {
    this.isRecording = false;
    console.log('Recording stopped');
  }

  cleanup() {
    this.isRecording = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    console.log('Audio processor cleaned up');
  }

  // Calculate RMS (Root Mean Square) audio level
  calculateRMS(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  // Resample audio from one sample rate to another
  resample(audioData, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return audioData;
    }

    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      // Linear interpolation
      if (index + 1 < audioData.length) {
        result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction;
      } else {
        result[i] = audioData[index];
      }
    }

    return result;
  }

  // Convert Float32Array to Int16Array (PCM16)
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp values to -1.0 to 1.0
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit PCM
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  // Get visualizer data for canvas
  getVisualizerData() {
    if (!this.analyser) return null;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);

    return dataArray;
  }

  // Decode base64 audio and play
  async playAudio(base64Audio) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: CONFIG.SAMPLE_RATE,
        });
      }

      // Decode base64 to array buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);

      // Create source and play
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(0);

      console.log('Playing audio chunk');
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }

  // Alternative: Play raw PCM16 data with queuing for smooth playback
  playRawPCM(pcm16Data) {
    try {
      // Create separate playback context if needed
      if (!this.playbackContext) {
        this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: CONFIG.SAMPLE_RATE,
        });
        console.log('Playback AudioContext created, sample rate:', this.playbackContext.sampleRate);
      }

      // Resume if suspended (browser autoplay policy)
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume();
      }

      // Convert Int16Array to Float32Array
      const float32Array = new Float32Array(pcm16Data.length);
      for (let i = 0; i < pcm16Data.length; i++) {
        float32Array[i] = pcm16Data[i] / (pcm16Data[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create audio buffer
      const audioBuffer = this.playbackContext.createBuffer(
        CONFIG.CHANNELS,
        float32Array.length,
        CONFIG.SAMPLE_RATE
      );

      audioBuffer.getChannelData(0).set(float32Array);

      // Schedule playback
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      // Queue audio for smooth playback
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      console.log('Playing raw PCM audio, duration:', audioBuffer.duration.toFixed(3), 's');
    } catch (error) {
      console.error('Failed to play raw PCM:', error);
    }
  }
}
