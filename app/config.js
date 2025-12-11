// 11labs Configuration for Story Time
const CONFIG = {
  ELEVENLABS_AGENT_ID: 'agent_xxxx', // Story Time agent
  ELEVENLABS_WS_URL: 'wss://api.elevenlabs.io/v1/convai/conversation',

  // Audio Configuration
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,

  // Buffer settings
  BUFFER_SIZE: 4096,
  SEND_INTERVAL_MS: 100, // Send audio chunks every 100ms
};
