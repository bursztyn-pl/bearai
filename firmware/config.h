#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// 11labs Configuration
const char* ELEVENLABS_AGENT_ID = "YOUR_AGENT_ID";
const char* ELEVENLABS_WS_HOST = "api.elevenlabs.io";
const int ELEVENLABS_WS_PORT = 443;
const char* ELEVENLABS_WS_PATH = "/v1/convai/conversation";

// Audio Configuration
#define SAMPLE_RATE 16000
#define BITS_PER_SAMPLE 16
#define CHANNELS 1

// I2S Microphone Pins (INMP441)
#define I2S_MIC_SERIAL_CLOCK 26  // SCK
#define I2S_MIC_LEFT_RIGHT_CLOCK 25  // WS
#define I2S_MIC_SERIAL_DATA 33  // SD

// I2S Speaker Pins (MAX98357A)
#define I2S_SPEAKER_SERIAL_CLOCK 14  // BCLK
#define I2S_SPEAKER_LEFT_RIGHT_CLOCK 15  // LRC
#define I2S_SPEAKER_SERIAL_DATA 22  // DIN

// Audio Buffer Settings
#define AUDIO_BUFFER_SIZE 1024
#define SEND_AUDIO_INTERVAL_MS 64  // ~64ms chunks

#endif
