# Voice AI Assistant - Local Web App

Local web application with mobile-like UI for voice conversations with 11labs Agents Platform.

## Features

- Mobile-responsive UI (works on desktop with mobile styling)
- Bluetooth microphone support via Web Audio API
- Real-time voice visualization
- WebSocket connection to 11labs Agents Platform
- Automatic audio transcription display
- Agent response audio playback
- Ping/pong heartbeat handling

## Setup

### 1. Configure 11labs Agent

Edit `config.js` and set your agent ID:

```javascript
const CONFIG = {
  ELEVENLABS_AGENT_ID: 'your_agent_id_here',
  // ... other settings
};
```

Get your agent_id from: https://elevenlabs.io/app/conversational-ai

### 2. Run the App

Since this is a local web app, you need to serve it via HTTP(S). You can use:

**Option A: Python HTTP Server**
```bash
cd app
python -m http.server 8000
```

**Option B: Node.js HTTP Server**
```bash
npm install -g http-server
cd app
http-server -p 8000
```

**Option C: VS Code Live Server**
- Install "Live Server" extension
- Right-click `index.html` → Open with Live Server

### 3. Open in Browser

Navigate to: `http://localhost:8000`

## How to Use

1. Click "Start Conversation"
2. Allow microphone access when prompted
3. Wait for connection to establish
4. Start speaking - your audio is sent to 11labs in real-time
5. See transcriptions and agent responses appear in the conversation
6. Agent audio responses play automatically
7. Click "Stop" to end the conversation

## Bluetooth Microphone

To use a Bluetooth microphone:
1. Pair your Bluetooth mic with your computer/device
2. Set it as the default input device in system settings
3. When the app requests microphone access, select the Bluetooth mic

The browser's `getUserMedia()` API will automatically use your selected microphone.

## Architecture

```
Bluetooth Mic → Web Audio API → AudioProcessor
                                      ↓
                              PCM16 encoding
                                      ↓
                            Base64 encoding
                                      ↓
                     WebSocket → 11labs API
                                      ↓
                            Agent Response
                                      ↓
                           Audio Playback
```

## Audio Configuration

- Sample Rate: 16kHz
- Format: PCM16 (16-bit)
- Channels: Mono (1 channel)
- Buffer Size: 4096 samples
- Send Interval: 100ms chunks

## Files

- `index.html` - Main UI structure
- `styles.css` - Mobile-like styling
- `config.js` - Configuration (agent_id, audio settings)
- `audio-processor.js` - Web Audio API handling
- `app.js` - Main application logic

## Message Protocol

### Sent to 11labs
```json
{
  "user_audio_chunk": "base64_encoded_pcm16_audio"
}
```

### Received from 11labs
```json
{
  "type": "conversation_initiation_metadata",
  "conversation_initiation_metadata_event": {
    "conversation_id": "conv_abc123"
  }
}
```

```json
{
  "type": "user_transcript",
  "user_transcription_event": {
    "user_transcript": "Hello"
  }
}
```

```json
{
  "type": "agent_response",
  "agent_response_event": {
    "agent_response": "Hi there!"
  }
}
```

```json
{
  "type": "audio",
  "audio_event": {
    "audio_base_64": "base64_encoded_audio"
  }
}
```

```json
{
  "type": "ping",
  "ping_event": {
    "event_id": "ping_123"
  }
}
```

## Troubleshooting

### Microphone not working
- Check browser permissions (camera/microphone)
- Ensure Bluetooth mic is paired and set as default
- Try refreshing the page

### WebSocket connection fails
- Verify agent_id in config.js
- Check browser console for errors
- Ensure you have a valid 11labs account and agent

### No audio playback
- Check system volume
- Verify speaker/headphone connection
- Check browser console for audio errors

### HTTPS Required Error
- Some browsers require HTTPS for microphone access
- Use `localhost` (works with HTTP)
- Or set up HTTPS with a self-signed cert

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 14.3+)
- Opera: Full support

## Development Notes

- Uses deprecated ScriptProcessor for hackathon speed
- For production, migrate to AudioWorklet
- No build process required - vanilla JS
- Mobile-first responsive design

## License

MIT - Hackathon Project
