# ESP32 11labs Voice Agent Client

Direct ESP32 to 11labs Agents Platform WebSocket connection for voice conversations.

## Hardware Requirements

- ESP32 Development Board
- INMP441 I2S MEMS Microphone
- MAX98357A I2S Audio Amplifier + Speaker (optional for audio output)

## Wiring

### INMP441 Microphone → ESP32
```
INMP441          ESP32
SCK       →      GPIO 26
WS        →      GPIO 25
SD        →      GPIO 33
VDD       →      3.3V
GND       →      GND
L/R       →      GND (left channel)
```

### MAX98357A Speaker → ESP32
```
MAX98357A        ESP32
BCLK      →      GPIO 14
LRC       →      GPIO 15
DIN       →      GPIO 22
VIN       →      5V
GND       →      GND
```

## Arduino IDE Setup

### Required Libraries
Install via Arduino Library Manager:
1. **WebSockets** by Markus Sattler
2. **ArduinoJson** by Benoit Blanchon (v6.x)
3. **Base64** by Densaugeo

### Board Configuration
1. Install ESP32 board support: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. Select **ESP32 Dev Module** from Tools → Board
3. Set partition scheme to **Default 4MB with spiffs**

## Configuration

Edit `config.h` and set:
```cpp
const char* WIFI_SSID = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";
const char* ELEVENLABS_AGENT_ID = "your_agent_id";
```

Get your agent_id from: https://elevenlabs.io/app/conversational-ai

## Upload & Run

1. Connect ESP32 via USB
2. Select correct COM port in Tools → Port
3. Click Upload
4. Open Serial Monitor (115200 baud) to see logs

## How It Works

1. ESP32 connects to WiFi
2. Establishes secure WebSocket connection to 11labs API
3. Captures audio from microphone (16kHz PCM16 mono)
4. Encodes audio to base64 and sends as `user_audio_chunk`
5. Receives agent responses as base64-encoded audio
6. Decodes and plays through speaker
7. Handles ping/pong heartbeats automatically

## Message Flow

```
ESP32 → 11labs: {"user_audio_chunk": "base64_audio_data"}
11labs → ESP32: {"type": "audio", "audio_event": {"audio_base_64": "..."}}
11labs → ESP32: {"type": "user_transcript", ...}
11labs → ESP32: {"type": "agent_response", ...}
11labs → ESP32: {"type": "ping", "ping_event": {"event_id": "..."}}
ESP32 → 11labs: {"type": "pong", "event_id": "..."}
```

## Troubleshooting

- **No WiFi connection**: Check SSID/password in config.h
- **WebSocket fails**: Verify agent_id is correct
- **No audio capture**: Check microphone wiring and I2S pins
- **No audio output**: Verify speaker wiring and power supply
- **SSL errors**: Ensure ESP32 has enough free heap memory

## Serial Monitor Output

```
Starting ESP32 11labs Voice Agent...
Connecting to WiFi: YourSSID
WiFi connected!
IP address: 192.168.1.100
Microphone initialized
Speaker initialized
Connecting to 11labs WebSocket...
[WS] Connected to 11labs
[11labs] Conversation initiated
Conversation ID: conv_abc123
[User]: Hello
[Agent]: Hi there! How can I help you today?
[11labs] Received audio chunk
```

## Notes

- Audio chunks sent every ~64ms
- 16kHz sample rate, 16-bit PCM, mono
- TLS/SSL enabled for secure connection
- Automatic reconnection on disconnect
- Heartbeat every 15 seconds
