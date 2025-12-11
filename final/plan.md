# Hackathon Blueprint: Local App + Bluetooth Mic → 11labs Voice AI

## Architecture
```
Bluetooth Mic → Local Web/Desktop App <--websocket--> 11labs Agents API
                (Mobile-like UI)         wss://api.elevenlabs.io/v1/convai/conversation?agent_id=XXX
```

## Key Components

### 1. Local Web App (Electron/React/Vue)
- **UI**: Mobile-like interface (responsive design)
- **Audio Input**: Web Audio API → Bluetooth microphone
- **Audio Output**: Web Audio API → System speakers
- **WebSocket**: Browser native WebSocket or `ws` library
- **TLS/SSL**: Handled by browser/Node.js
- **Auth**: agent_id in URL query parameter

### 2. Audio Pipeline
- **Capture**: `getUserMedia()` for microphone access
- **Format**: PCM16, 16kHz mono (required by 11labs)
- **Processing**: AudioWorklet or ScriptProcessor
- **Encoding**: Base64 encoding for WebSocket transmission
- **Playback**: AudioContext for decoding and playing agent responses

### 3. 11labs Agents Platform WebSocket API
- **Endpoint**: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=YOUR_AGENT_ID`
- **Protocol**: JSON messages over WebSocket
- **Message handling**:
  - Send: `user_audio_chunk` (base64 encoded)
  - Receive: `audio` events (base64 encoded agent speech)
  - Handle: `conversation_initiation_metadata`, `user_transcript`, `agent_response`
  - Ping/Pong heartbeat responses

### 4. Tech Stack Options
**Option A: Web App (HTML/CSS/JS)**
- Fastest for hackathon
- Works on any device with browser
- Can be packaged as PWA for mobile feel

**Option B: Electron App**
- Desktop app with mobile-like UI
- Better audio control
- Native look and feel

**Option C: React/Vue SPA**
- Modern framework
- Component-based UI
- Easy to style like mobile app

## Quick Start Files Needed
- `index.html` - Main app entry point
- `app.js` - WebSocket + audio logic
- `audio-processor.js` - AudioWorklet for real-time processing
- `styles.css` - Mobile-like UI styling
- `config.js` - 11labs agent_id configuration

## Todo List
- [ ] Set up ESP32 microphone (I2S MEMS mic) - basic audio capture
- [ ] Create ESP32 websocket client to stream audio chunks
- [ ] Build Node.js/Python bridge server (ESP32 ↔ 11labs)
- [ ] Integrate 11labs websocket API connection
- [ ] Set up audio pipeline (PCM format, sample rate handling)
- [ ] Add ESP32 speaker output (I2S DAC) for playback
