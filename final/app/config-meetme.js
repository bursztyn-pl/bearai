// 11labs Configuration for Meet Me
const CONFIG = {
  ELEVENLABS_AGENT_ID: 'agemt_xxx', // Replace with Meet Me agent ID
  ELEVENLABS_WS_URL: 'wss://api.elevenlabs.io/v1/convai/conversation',

  // Audio Configuration
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,

  // Buffer settings
  BUFFER_SIZE: 4096,
  SEND_INTERVAL_MS: 100, // Send audio chunks every 100ms
};
