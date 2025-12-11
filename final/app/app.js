// Main Application
class VoiceAIApp {
  constructor() {
    this.ws = null;
    this.audioProcessor = new AudioProcessor();
    this.conversationId = null;
    this.isConnected = false;
    this.isRecording = false;
    this.audioQueue = [];
    this.sendIntervalId = null;

    // UI Elements
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.conversationContainer = document.getElementById('conversationContainer');
    this.micStatus = document.getElementById('micStatus');
    this.agentStatus = document.getElementById('agentStatus');
    this.visualizerCanvas = document.getElementById('visualizerCanvas');
    this.visualizerCtx = this.visualizerCanvas.getContext('2d');

    this.initializeUI();
  }

  initializeUI() {
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
  }

  async start() {
    try {
      this.startBtn.disabled = true;
      this.updateMicStatus('Initializing...');

      // Initialize audio processor
      await this.audioProcessor.initialize();
      this.updateMicStatus('Ready');

      // Connect to WebSocket
      this.updateAgentStatus('Connecting...');
      await this.connectWebSocket();

      // Start recording
      this.audioProcessor.startRecording();
      this.isRecording = true;

      // Set up audio data callback - send all audio, let 11labs handle VAD
      this.audioProcessor.onAudioData = (pcm16Data, audioLevel) => {
        // Always queue audio - 11labs will handle voice activity detection
        this.audioQueue.push(pcm16Data);
      };

      // Send audio chunks periodically
      this.startSendingAudio();

      // Start visualizer
      this.startVisualizer();

      // Update UI
      this.startBtn.style.display = 'none';
      this.stopBtn.style.display = 'flex';
      this.clearPlaceholder();

      console.log('Application started');
    } catch (error) {
      console.error('Failed to start:', error);
      alert('Failed to start: ' + error.message);
      this.startBtn.disabled = false;
      this.updateMicStatus('Error');
      this.updateAgentStatus('Error');
    }
  }

  async stop() {
    this.isRecording = false;

    // Stop sending audio
    if (this.sendIntervalId) {
      clearInterval(this.sendIntervalId);
      this.sendIntervalId = null;
    }

    // Stop recording
    this.audioProcessor.stopRecording();
    this.audioProcessor.cleanup();

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Update UI
    this.stopBtn.style.display = 'none';
    this.startBtn.style.display = 'flex';
    this.startBtn.disabled = false;
    this.updateConnectionStatus(false);
    this.updateMicStatus('Stopped');
    this.updateAgentStatus('Disconnected');

    console.log('Application stopped');
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${CONFIG.ELEVENLABS_WS_URL}?agent_id=${CONFIG.ELEVENLABS_AGENT_ID}`;

      console.log('Connecting to:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.updateConnectionStatus(true);
        this.updateAgentStatus('Connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateAgentStatus('Error');
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed, code:', event.code, 'reason:', event.reason);
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.updateAgentStatus('Disconnected');

        // Stop sending audio
        if (this.sendIntervalId) {
          clearInterval(this.sendIntervalId);
          this.sendIntervalId = null;
        }
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('Received message:', message.type);

      switch (message.type) {
        case 'conversation_initiation_metadata':
          this.conversationId = message.conversation_initiation_metadata_event.conversation_id;
          console.log('Conversation ID:', this.conversationId);

          // Check audio formats
          const metadata = message.conversation_initiation_metadata_event;
          console.log('📋 Audio formats from 11labs:');
          console.log('  - Input format expected:', metadata.user_input_audio_format);
          console.log('  - Output format:', metadata.agent_output_audio_format);

          this.addSystemMessage('Conversation started');
          break;

        case 'user_transcript':
          const userText = message.user_transcription_event.user_transcript;
          console.log('User:', userText);
          this.addMessage('user', userText);
          break;

        case 'agent_response':
          const agentText = message.agent_response_event.agent_response;
          console.log('Agent:', agentText);
          this.addMessage('agent', agentText);
          break;

        case 'audio':
          const audioBase64 = message.audio_event.audio_base_64;
          console.log('Received audio chunk');
          this.playAudio(audioBase64);
          break;

        case 'ping':
          const eventId = message.ping_event.event_id;
          this.sendPong(eventId);
          break;

        case 'agent_response_correction':
          console.log('Agent corrected response');
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  startSendingAudio() {
    this.sendIntervalId = setInterval(() => {
      if (this.audioQueue.length > 0 && this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Combine all queued audio chunks
        const totalLength = this.audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Int16Array(totalLength);
        let offset = 0;

        for (const chunk of this.audioQueue) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        this.audioQueue = [];

        // Convert to base64
        const audioBase64 = this.arrayBufferToBase64(combined.buffer);

        // Send to 11labs
        const message = {
          user_audio_chunk: audioBase64
        };

        try {
          this.ws.send(JSON.stringify(message));
          console.log('Sent audio chunk:', combined.length, 'samples');
        } catch (error) {
          console.error('Failed to send audio:', error);
        }
      }
    }, CONFIG.SEND_INTERVAL_MS);
  }

  sendPong(eventId) {
    if (!this.ws || !this.isConnected) return;

    const message = {
      type: 'pong',
      event_id: eventId
    };

    this.ws.send(JSON.stringify(message));
    console.log('Sent pong');
  }

  async playAudio(base64Audio) {
    try {
      // Decode base64 to binary (PCM16 format from 11labs)
      const binaryString = atob(base64Audio);

      // Convert binary string to Int16Array (PCM16)
      const int16Array = new Int16Array(binaryString.length / 2);
      for (let i = 0; i < int16Array.length; i++) {
        // Read 16-bit little-endian values
        const byte1 = binaryString.charCodeAt(i * 2);
        const byte2 = binaryString.charCodeAt(i * 2 + 1);
        int16Array[i] = byte1 | (byte2 << 8);
      }

      console.log('Playing PCM16 audio, samples:', int16Array.length);
      this.audioProcessor.playRawPCM(int16Array);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }

  startVisualizer() {
    const draw = () => {
      if (!this.isRecording) return;

      requestAnimationFrame(draw);

      const dataArray = this.audioProcessor.getVisualizerData();
      if (!dataArray) return;

      const width = this.visualizerCanvas.width;
      const height = this.visualizerCanvas.height;
      const bufferLength = dataArray.length;

      this.visualizerCtx.fillStyle = '#0f172a';
      this.visualizerCtx.fillRect(0, 0, width, height);

      this.visualizerCtx.lineWidth = 2;
      this.visualizerCtx.strokeStyle = '#6366f1';
      this.visualizerCtx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          this.visualizerCtx.moveTo(x, y);
        } else {
          this.visualizerCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.visualizerCtx.lineTo(width, height / 2);
      this.visualizerCtx.stroke();
    };

    draw();
  }

  // UI Update Methods
  updateConnectionStatus(connected) {
    if (connected) {
      this.connectionStatus.classList.add('connected');
      this.connectionStatus.querySelector('.status-text').textContent = 'Connected';
    } else {
      this.connectionStatus.classList.remove('connected');
      this.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
    }
  }

  updateMicStatus(status) {
    this.micStatus.textContent = status;
  }

  updateAgentStatus(status) {
    this.agentStatus.textContent = status;
  }

  clearPlaceholder() {
    const placeholder = this.conversationContainer.querySelector('.message-placeholder');
    if (placeholder) {
      placeholder.remove();
    }
  }

  addMessage(type, text) {
    this.clearPlaceholder();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = type === 'user' ? 'You' : 'Agent';

    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.textContent = text;

    messageDiv.appendChild(label);
    messageDiv.appendChild(textDiv);

    this.conversationContainer.appendChild(messageDiv);
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }

  addSystemMessage(text) {
    this.clearPlaceholder();

    const messageDiv = document.createElement('div');
    messageDiv.style.textAlign = 'center';
    messageDiv.style.padding = '8px';
    messageDiv.style.fontSize = '12px';
    messageDiv.style.color = '#94a3b8';
    messageDiv.textContent = text;

    this.conversationContainer.appendChild(messageDiv);
    this.conversationContainer.scrollTop = this.conversationContainer.scrollHeight;
  }

  // Helper Methods
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new VoiceAIApp();
  console.log('Voice AI App initialized');
});
