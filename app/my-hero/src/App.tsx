import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Volume2, AlertCircle, Check, Loader, Settings, RefreshCw, Copy, CheckCircle2, Sparkles, Users, Bot, Upload, Shuffle } from 'lucide-react';
import { getRandomToyName } from './toyNames';

type AppState = 'initial' | 'options' | 'recording' | 'processing' | 'complete' | 'error';

interface DebugLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: unknown;
}

interface ApiStatus {
  checked: boolean;
  apiKeyConfigured: boolean;
  error: string | null;
}

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

const AGENT_ID = 'agent_xxx';

function App() {
  const [state, setState] = useState<AppState>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceName, setVoiceName] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ checked: false, apiKeyConfigured: false, error: null });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [updatingAgent, setUpdatingAgent] = useState(false);
  const [agentUpdateSuccess, setAgentUpdateSuccess] = useState(false);
  const [agentUpdateError, setAgentUpdateError] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audioSource, setAudioSource] = useState<'recorded' | 'uploaded' | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  const addLog = (level: DebugLog['level'], message: string, data?: unknown) => {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    setDebugLogs(prev => [...prev, log]);
    console.log(`[${level.toUpperCase()}] ${message}`, data || '');
    setTimeout(() => {
      if (debugRef.current) {
        debugRef.current.scrollTop = debugRef.current.scrollHeight;
      }
    }, 50);
  };

  const checkApiStatus = async () => {
    addLog('info', 'Checking API status...');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clone-voice`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      const data = await response.json();
      addLog('info', 'API status response', data);

      setApiStatus({
        checked: true,
        apiKeyConfigured: data.config?.elevenlabs_api_key_configured ?? false,
        error: null
      });

      if (data.config?.elevenlabs_api_key_configured) {
        addLog('success', 'ElevenLabs API key is configured');
      } else {
        addLog('warn', 'ElevenLabs API key is NOT configured');
      }
    } catch (error) {
      addLog('error', 'Failed to check API status', error);
      setApiStatus({
        checked: true,
        apiKeyConfigured: false,
        error: 'Failed to connect to API'
      });
    }
  };

  const fetchVoices = async () => {
    setLoadingVoices(true);
    addLog('info', 'Fetching voices from ElevenLabs...');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-voices`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        addLog('error', 'Failed to fetch voices', data);
        return;
      }

      const voiceList = data.voices || [];
      setVoices(voiceList);
      addLog('success', `Fetched ${voiceList.length} voices from ElevenLabs`);

      const clonedVoices = voiceList.filter((v: Voice) => v.category === 'cloned');
      addLog('info', `Found ${clonedVoices.length} cloned voices`, clonedVoices.map((v: Voice) => ({ id: v.voice_id, name: v.name })));
    } catch (error) {
      addLog('error', 'Error fetching voices', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const updateAgentVoice = async () => {
    if (!selectedVoiceId) {
      addLog('warn', 'No voice selected');
      return;
    }

    setUpdatingAgent(true);
    setAgentUpdateSuccess(false);
    setAgentUpdateError('');

    const selectedVoice = voices.find(v => v.voice_id === selectedVoiceId);
    addLog('info', `Updating agent ${AGENT_ID} voice to: ${selectedVoice?.name || selectedVoiceId}`);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-agent-voice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_id: AGENT_ID,
            voice_id: selectedVoiceId,
          }),
        }
      );

      const data = await response.json();
      addLog('info', 'Update agent response', data);

      if (!response.ok) {
        addLog('error', 'Failed to update agent voice', data);
        setAgentUpdateError(data.error || 'Failed to update agent voice');
        return;
      }

      setAgentUpdateSuccess(true);
      addLog('success', `Agent voice updated successfully! Agent "${data.agent_name}" now uses voice: ${selectedVoice?.name || selectedVoiceId}`);

      setTimeout(() => setAgentUpdateSuccess(false), 5000);
    } catch (error) {
      addLog('error', 'Error updating agent voice', error);
      setAgentUpdateError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUpdatingAgent(false);
    }
  };

  useEffect(() => {
    addLog('info', 'App initialized');
    checkApiStatus();
    fetchVoices();
  }, []);

  const handleStartClick = () => {
    addLog('info', 'Start button clicked');
    const randomName = getRandomToyName();
    setVoiceName(randomName);
    addLog('info', `Auto-generated voice name: ${randomName}`);
    setState('options');
  };

  const generateNewName = () => {
    const randomName = getRandomToyName();
    setVoiceName(randomName);
    addLog('info', `Shuffled voice name: ${randomName}`);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    addLog('info', `File selected: ${file.name}`, { size: file.size, type: file.type });

    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|webm|ogg|m4a)$/i)) {
      addLog('error', 'Invalid file type', { type: file.type });
      alert('Please upload an audio file (MP3, WAV, WebM, OGG, or M4A)');
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      addLog('error', 'File too large', { size: file.size, maxSize });
      alert('File is too large. Maximum size is 50MB.');
      return;
    }

    setAudioBlob(file);
    setAudioSource('uploaded');
    setUploadedFileName(file.name);
    setRecordingDuration(0);
    addLog('success', `Audio file uploaded: ${file.name}`, { size: file.size });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      addLog('info', 'Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      addLog('success', 'Microphone access granted');
      addLog('info', 'Creating MediaRecorder instance');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          addLog('info', `Audio chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = () => {
        addLog('info', 'Recording stopped, processing audio chunks');
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        addLog('success', `Audio blob created: ${audioBlob.size} bytes`);
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => {
          track.stop();
          addLog('info', 'Media track stopped');
        });
        setState('options');
        addLog('info', 'Transitioned to options state');
      };

      const startTime = Date.now();
      setRecordingStartTime(startTime);
      setRecordingDuration(0);
      addLog('info', 'Starting recording timer');

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingDuration(elapsed);
      }, 100);

      mediaRecorder.start();
      setIsRecording(true);
      setAudioSource('recorded');
      setState('recording');
      addLog('success', 'Recording started');
    } catch (error) {
      addLog('error', 'Failed to start recording', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    addLog('info', 'Stop recording requested');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      addLog('success', 'Recording stopped successfully');
    }
  };

  const playRecording = () => {
    if (audioBlob && audioRef.current) {
      addLog('info', 'Playing recorded audio');
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      addLog('success', 'Audio playback started');
    }
  };

  const createVoiceClone = async () => {
    if (!audioBlob || !voiceName.trim()) {
      addLog('warn', 'Missing audio blob or voice name');
      alert('Please provide a name for your voice');
      return;
    }

    setState('processing');
    setErrorMessage('');
    setErrorDetails('');
    addLog('info', 'Starting voice clone creation', { voiceName, audioBlobSize: audioBlob.size });

    try {
      const formData = new FormData();
      formData.append('name', voiceName);
      formData.append('audio', audioBlob, 'voice-recording.webm');

      addLog('info', 'Sending request to edge function...');
      addLog('info', 'FormData contents:', { name: voiceName, audioSize: audioBlob.size, audioType: audioBlob.type });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clone-voice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData
        }
      );

      addLog('info', `Response status: ${response.status}`);

      const data = await response.json();
      addLog('info', 'Response data received', data);

      if (!response.ok) {
        addLog('error', 'API returned error', data);
        setErrorMessage(data.error || 'Failed to create voice clone');
        setErrorDetails(data.details || data.help || '');
        setState('error');
        return;
      }

      setVoiceId(data.voice_id);
      setState('complete');
      addLog('success', 'Voice clone created successfully!', { voiceId: data.voice_id });

      fetchVoices();
    } catch (error) {
      addLog('error', 'Failed to create voice clone', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setErrorDetails('Network error or server unavailable');
      setState('error');
    }
  };

  const reset = () => {
    addLog('info', 'Resetting app to initial state');
    setState('initial');
    setAudioBlob(null);
    setVoiceId('');
    setVoiceName('');
    setIsRecording(false);
    setRecordingDuration(0);
    setRecordingStartTime(null);
    setErrorMessage('');
    setErrorDetails('');
    setCopied(false);
    setAudioSource(null);
    setUploadedFileName('');
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const retryFromError = () => {
    addLog('info', 'Retrying from error state');
    setErrorMessage('');
    setErrorDetails('');
    setState('options');
  };

  const copyVoiceId = async () => {
    if (voiceId) {
      try {
        await navigator.clipboard.writeText(voiceId);
        setCopied(true);
        addLog('success', 'Voice ID copied to clipboard', { voiceId });
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        addLog('error', 'Failed to copy voice ID', error);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getLevelColor = (level: DebugLog['level']) => {
    switch (level) {
      case 'info': return 'text-blue-400';
      case 'warn': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
    }
  };

  const clonedVoices = voices.filter(v => v.category === 'cloned');

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-blue-100 to-teal-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex justify-end">
          <div className="bg-white rounded-lg px-4 py-2 shadow flex items-center gap-2">
            <Settings size={16} className="text-gray-500" />
            <span className="text-sm text-gray-600">API Status:</span>
            {!apiStatus.checked ? (
              <span className="text-sm text-gray-500">Checking...</span>
            ) : apiStatus.apiKeyConfigured ? (
              <span className="text-sm text-green-600 font-semibold">Connected</span>
            ) : (
              <span className="text-sm text-red-600 font-semibold">Not Configured</span>
            )}
            <button
              onClick={checkApiStatus}
              className="ml-2 text-gray-500 hover:text-gray-700"
              title="Refresh status"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
            Voice Clone for Kids
          </h1>

          {!apiStatus.apiKeyConfigured && apiStatus.checked && (
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 mb-6">
              <p className="text-yellow-800 font-semibold text-center">
                ElevenLabs API key is not configured.
              </p>
              <p className="text-yellow-700 text-sm text-center mt-2">
                Add your ELEVENLABS_API_KEY in Supabase Edge Functions secrets to enable voice cloning.
              </p>
            </div>
          )}

          {state === 'initial' && (
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={handleStartClick}
                className="bg-gradient-to-r from-blue-500 to-teal-500 text-white text-3xl font-bold py-12 px-16 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                Start
              </button>
            </div>
          )}

          {state === 'options' && !audioBlob && (
            <div className="flex flex-col items-center gap-8">
              <p className="text-xl text-gray-600">Choose how to provide your voice sample:</p>

              <div className="flex flex-col sm:flex-row gap-6">
                <button
                  onClick={startRecording}
                  disabled={isRecording}
                  className="bg-red-500 text-white text-xl font-bold py-8 px-10 rounded-3xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex flex-col items-center gap-3 disabled:opacity-50"
                >
                  <Mic size={48} />
                  <span>Record Voice</span>
                  <span className="text-sm font-normal opacity-80">Use your microphone</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-500 text-white text-xl font-bold py-8 px-10 rounded-3xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex flex-col items-center gap-3"
                >
                  <Upload size={48} />
                  <span>Upload File</span>
                  <span className="text-sm font-normal opacity-80">MP3, WAV, or other</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                onClick={reset}
                className="text-gray-600 text-lg underline hover:text-gray-800"
              >
                Go Back
              </button>
            </div>
          )}

          {state === 'recording' && (
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <div className="bg-red-500 w-24 h-24 rounded-full mx-auto mb-4 animate-pulse flex items-center justify-center">
                  <Mic size={48} className="text-white" />
                </div>
                <p className="text-2xl font-bold text-gray-800 mb-2">Recording...</p>
                <div className="text-6xl font-bold text-red-600 my-4">
                  {formatTime(recordingDuration)}
                </div>
                {recordingDuration < 10 ? (
                  <p className="text-lg text-orange-600 font-semibold">
                    Keep recording! Need at least 10 seconds ({10 - recordingDuration}s remaining)
                  </p>
                ) : (
                  <p className="text-lg text-green-600 font-semibold">
                    Great! You can stop now or keep recording
                  </p>
                )}
                <p className="text-lg text-gray-600 mt-2">Speak clearly into your microphone</p>
              </div>
              <button
                onClick={stopRecording}
                disabled={recordingDuration < 10}
                className="bg-gray-800 text-white text-2xl font-bold py-10 px-14 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square size={48} />
                Stop Recording
              </button>
            </div>
          )}

          {audioBlob && state === 'options' && (
            <div className="flex flex-col items-center gap-6">
              <div className="bg-green-100 p-6 rounded-2xl">
                {audioSource === 'uploaded' ? (
                  <>
                    <Upload size={64} className="text-green-600 mx-auto mb-2" />
                    <p className="text-xl font-bold text-gray-800 text-center">File Uploaded!</p>
                    <p className="text-lg text-gray-600 text-center mt-2 break-all max-w-sm">
                      {uploadedFileName}
                    </p>
                  </>
                ) : (
                  <>
                    <Check size={64} className="text-green-600 mx-auto mb-2" />
                    <p className="text-xl font-bold text-gray-800 text-center">Recording Complete!</p>
                    <p className="text-lg text-gray-600 text-center mt-2">
                      Duration: {formatTime(recordingDuration)}
                    </p>
                  </>
                )}
              </div>

              <button
                onClick={playRecording}
                className="bg-blue-500 text-white text-xl font-bold py-6 px-10 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-3"
              >
                <Volume2 size={32} />
                Play Audio
              </button>

              <div className="w-full max-w-md">
                <p className="text-sm text-gray-500 text-center mb-2">Voice Name (auto-generated)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter voice name"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="text-xl px-6 py-4 border-4 border-blue-300 rounded-2xl flex-1 text-center focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={generateNewName}
                    className="bg-gray-200 hover:bg-gray-300 px-4 rounded-2xl transition-colors flex items-center justify-center"
                    title="Generate new random name"
                  >
                    <Shuffle size={24} className="text-gray-600" />
                  </button>
                </div>
              </div>

              <button
                onClick={createVoiceClone}
                disabled={!voiceName.trim() || (audioSource === 'recorded' && recordingDuration < 10)}
                className="bg-gradient-to-r from-green-500 to-blue-600 text-white text-2xl font-bold py-8 px-12 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload to 11Labs & Create Clone
              </button>

              {audioSource === 'recorded' && recordingDuration < 10 && (
                <p className="text-red-600 font-semibold text-center">
                  Recording too short! Need at least 10 seconds for voice cloning.
                </p>
              )}

              <button
                onClick={reset}
                className="text-gray-600 text-lg underline hover:text-gray-800"
              >
                Start Over
              </button>
            </div>
          )}

          {state === 'processing' && (
            <div className="flex flex-col items-center gap-6">
              <Loader size={64} className="text-blue-600 animate-spin" />
              <p className="text-2xl font-bold text-gray-800">Creating your voice clone...</p>
              <p className="text-lg text-gray-600">This may take a few moments</p>
            </div>
          )}

          {state === 'complete' && voiceId && (
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="absolute -top-4 -left-4 text-yellow-400 animate-bounce">
                  <Sparkles size={32} />
                </div>
                <div className="absolute -top-4 -right-4 text-yellow-400 animate-bounce delay-100">
                  <Sparkles size={32} />
                </div>
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 p-10 rounded-3xl text-center border-4 border-green-400 shadow-xl">
                  <div className="bg-green-500 w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg">
                    <CheckCircle2 size={64} className="text-white" />
                  </div>
                  <p className="text-4xl font-bold text-green-700 mb-2">Voice Cloned!</p>
                  <p className="text-xl text-gray-600 mb-6">Your voice "{voiceName}" is ready to use</p>

                  <div className="bg-white rounded-xl p-6 border-2 border-green-300 shadow-inner">
                    <p className="text-sm text-gray-500 mb-2 uppercase tracking-wide font-semibold">Your Voice ID</p>
                    <div className="flex items-center justify-center gap-3">
                      <code className="text-xl font-mono text-blue-600 break-all bg-gray-50 px-4 py-2 rounded-lg">
                        {voiceId}
                      </code>
                      <button
                        onClick={copyVoiceId}
                        className={`p-3 rounded-lg transition-all duration-200 ${
                          copied
                            ? 'bg-green-500 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                        title="Copy Voice ID"
                      >
                        {copied ? <Check size={24} /> : <Copy size={24} />}
                      </button>
                    </div>
                    {copied && (
                      <p className="text-green-600 text-sm mt-2 font-semibold">Copied to clipboard!</p>
                    )}
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-sm text-blue-800">
                      Save this Voice ID! You can use it with ElevenLabs to generate speech in your voice.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={reset}
                className="bg-gradient-to-r from-blue-500 to-teal-500 text-white text-xl font-bold py-6 px-12 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                Create Another Voice
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-6">
              <div className="bg-red-100 p-8 rounded-2xl text-center max-w-lg">
                <AlertCircle size={80} className="text-red-600 mx-auto mb-4" />
                <p className="text-3xl font-bold text-gray-800 mb-4">Error</p>
                <p className="text-xl text-red-700 mb-4">{errorMessage}</p>
                {errorDetails && (
                  <div className="bg-white p-4 rounded-lg border-2 border-red-300 mt-4">
                    <p className="text-sm text-gray-700">{errorDetails}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={retryFromError}
                  className="bg-blue-500 text-white text-xl font-bold py-6 px-10 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
                >
                  <RefreshCw size={24} />
                  Try Again
                </button>
                <button
                  onClick={reset}
                  className="bg-gray-500 text-white text-xl font-bold py-6 px-10 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          <audio ref={audioRef} className="hidden" />
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Bot size={32} className="text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-800">Agent Voice Manager</h2>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">Agent ID:</p>
            <code className="text-sm font-mono text-blue-600 bg-white px-3 py-1 rounded border">{AGENT_ID}</code>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-800">Your Cloned Voices ({clonedVoices.length})</h3>
              </div>
              <button
                onClick={fetchVoices}
                disabled={loadingVoices}
                className="flex items-center gap-2 text-sm bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingVoices ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingVoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={32} className="text-blue-600 animate-spin" />
                <span className="ml-3 text-gray-600">Loading voices...</span>
              </div>
            ) : clonedVoices.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl">
                <p className="text-gray-600">No cloned voices found.</p>
                <p className="text-sm text-gray-500 mt-2">Create a voice clone above to get started!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {clonedVoices.map((voice) => (
                  <label
                    key={voice.voice_id}
                    className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedVoiceId === voice.voice_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voice"
                      value={voice.voice_id}
                      checked={selectedVoiceId === voice.voice_id}
                      onChange={(e) => {
                        setSelectedVoiceId(e.target.value);
                        addLog('info', `Selected voice: ${voice.name}`, { voice_id: voice.voice_id });
                      }}
                      className="w-5 h-5 text-blue-600"
                    />
                    <div className="ml-4 flex-1">
                      <p className="font-semibold text-gray-800">{voice.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{voice.voice_id}</p>
                    </div>
                    {selectedVoiceId === voice.voice_id && (
                      <Check size={20} className="text-blue-600" />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-6">
            <button
              onClick={updateAgentVoice}
              disabled={!selectedVoiceId || updatingAgent}
              className="w-full bg-gradient-to-r from-blue-500 to-teal-500 text-white text-xl font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {updatingAgent ? (
                <>
                  <Loader size={24} className="animate-spin" />
                  Updating Agent...
                </>
              ) : (
                <>
                  <Bot size={24} />
                  Update Agent Voice
                </>
              )}
            </button>

            {agentUpdateSuccess && (
              <div className="mt-4 p-4 bg-green-100 border-2 border-green-400 rounded-xl flex items-center gap-3">
                <CheckCircle2 size={24} className="text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Agent voice updated successfully!</p>
                  <p className="text-sm text-green-700">The agent will now use the selected voice.</p>
                </div>
              </div>
            )}

            {agentUpdateError && (
              <div className="mt-4 p-4 bg-red-100 border-2 border-red-400 rounded-xl flex items-center gap-3">
                <AlertCircle size={24} className="text-red-600" />
                <div>
                  <p className="font-semibold text-red-800">Failed to update agent voice</p>
                  <p className="text-sm text-red-700">{agentUpdateError}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <AlertCircle size={24} />
              Debug Console
            </h2>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-sm bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
            >
              {showDebug ? 'Hide' : 'Show'}
            </button>
          </div>

          {showDebug && (
            <div
              ref={debugRef}
              className="bg-gray-900 text-white p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm"
            >
              {debugLogs.map((log, index) => (
                <div key={index} className="mb-2">
                  <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {' '}
                  <span className={getLevelColor(log.level)}>[{log.level.toUpperCase()}]</span>
                  {' '}
                  <span className="text-gray-200">{log.message}</span>
                  {log.data && (
                    <pre className="text-gray-500 text-xs mt-1 ml-4">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
