/*
 * M5Atom Echo - Voice Assistant with Streaming Audio Playback
 *
 * Press button to record, release to send to backend.
 * Backend responds with RAW audio that streams and plays in real-time.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <Adafruit_NeoPixel.h>
#include "freertos/ringbuf.h"
#include "esp_wifi.h"

// ==================== CONFIG ====================
const char* WIFI_SSID = "Campus Community";
const char* WIFI_PASSWORD = "PragaPolnocValley";
const char* BACKEND_HOST = "100.114.138.235";
const int BACKEND_PORT = 8005;

// I2S pins for M5Atom Echo
#define CONFIG_I2S_BCK_PIN 19
#define CONFIG_I2S_LRCK_PIN 33
#define CONFIG_I2S_DATA_PIN 22
#define CONFIG_I2S_DATA_IN_PIN 23

#define SPEAKER_I2S_NUMBER I2S_NUM_0

#define MODE_MIC 0
#define MODE_SPK 1

// M5Atom Echo specific pins
#define LED_PIN 27
#define BTN_PIN 39

// Audio settings
#define DATA_SIZE 1024
#define RING_BUFFER_SIZE (1024 * 64)  // 64KB ring buffer for streaming
#define MAX_RECORD_BUFFER (1024 * 80) // 80KB for recording

// ==================== GLOBALS ====================
Adafruit_NeoPixel pixel(1, LED_PIN, NEO_GRB + NEO_KHZ800);
WebSocketsClient webSocket;

String device_id;
bool wsConnected = false;
bool isRecording = false;
bool isPlaying = false;

// Recording buffer
uint8_t* recordBuffer = nullptr;
int recordOffset = 0;

// Playback state
volatile bool isReceivingAudio = false;
volatile bool audioStreamEnded = false;
volatile int totalBytesReceived = 0;
volatile int totalBytesPlayed = 0;
TaskHandle_t playbackTaskHandle = nullptr;

// ==================== LED ====================
void setLed(uint8_t r, uint8_t g, uint8_t b) {
    pixel.setPixelColor(0, pixel.Color(r, g, b));
    pixel.show();
}

// ==================== I2S ====================
void InitI2S(int mode) {
    i2s_driver_uninstall(SPEAKER_I2S_NUMBER);

    // 16kHz for mic, 8kHz for speaker (speaker plays 2x due to mono->stereo conversion)
    // Backend sends 16kHz mono, we play at 8kHz to get correct speed
    int sample_rate = (mode == MODE_MIC) ? 16000 : 8000;

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER),
        .sample_rate = sample_rate,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ALL_RIGHT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,        // Larger DMA buffer for smooth playback
        .use_apll = false,
        .tx_desc_auto_clear = true,
        .fixed_mclk = 0
    };

    if (mode == MODE_MIC) {
        i2s_config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM);
    } else {
        i2s_config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
    }

    i2s_driver_install(SPEAKER_I2S_NUMBER, &i2s_config, 0, NULL);

    i2s_pin_config_t pin_config = {
        .mck_io_num = I2S_PIN_NO_CHANGE,
        .bck_io_num = CONFIG_I2S_BCK_PIN,
        .ws_io_num = CONFIG_I2S_LRCK_PIN,
        .data_out_num = CONFIG_I2S_DATA_PIN,
        .data_in_num = CONFIG_I2S_DATA_IN_PIN
    };

    i2s_set_pin(SPEAKER_I2S_NUMBER, &pin_config);
}

// ==================== DEVICE ID ====================
void initDeviceId() {
    uint64_t chipid = ESP.getEfuseMac();
    char id[20];
    sprintf(id, "%08X%08X", (uint32_t)(chipid >> 32), (uint32_t)chipid);
    device_id = String(id);
    Serial.println("Device ID: " + device_id);
}

// ==================== WIFI ====================
bool connectWiFi() {
    Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        setLed(0, 0, (attempts % 2) ? 255 : 50);
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("Connected! IP: " + WiFi.localIP().toString());

        // Disable WiFi power saving for better latency
        esp_wifi_set_ps(WIFI_PS_NONE);
        Serial.println("WiFi power saving disabled");

        setLed(0, 255, 0);
        return true;
    }

    Serial.println("WiFi connection failed!");
    setLed(255, 0, 0);
    return false;
}

// ==================== STREAMING PLAYBACK with Ring Buffer ====================
RingbufHandle_t audioRingBuffer = nullptr;

void playbackTask(void* param) {
    Serial.println("Playback task started - streaming mode");

    // Initialize speaker
    InitI2S(MODE_SPK);

    // Pre-buffer: wait for some data before starting playback
    int preBufferMs = 300;  // 300ms pre-buffer
    int preBufferBytes = (16000 * 2 * preBufferMs) / 1000;  // 16kHz * 16bit * ms

    Serial.printf("Pre-buffering %d bytes...\n", preBufferBytes);
    while (totalBytesReceived < preBufferBytes && !audioStreamEnded) {
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    Serial.printf("Pre-buffer done, starting playback (received: %d bytes)\n", totalBytesReceived);

    // Local buffer for amplification
    uint8_t localBuffer[1024];
    size_t bytesWritten;

    while (true) {
        // Check if we're done
        if (audioStreamEnded && totalBytesPlayed >= totalBytesReceived) {
            break;
        }

        // Try to get data from ring buffer
        size_t itemSize;
        void* item = xRingbufferReceiveUpTo(audioRingBuffer, &itemSize, pdMS_TO_TICKS(50), sizeof(localBuffer));

        if (item != nullptr && itemSize > 0) {
            // Copy and return buffer item
            memcpy(localBuffer, item, itemSize);
            vRingbufferReturnItem(audioRingBuffer, item);

            // Amplify audio
            int16_t* audio = (int16_t*)localBuffer;
            int numSamples = itemSize / 2;
            for (int i = 0; i < numSamples; i++) {
                int32_t val = audio[i];
                val = val * 4;  // Amplify
                audio[i] = constrain(val, -32768, 32767);
            }

            // Write to I2S
            i2s_write(SPEAKER_I2S_NUMBER, localBuffer, itemSize, &bytesWritten, portMAX_DELAY);
            totalBytesPlayed += bytesWritten;
        } else if (audioStreamEnded) {
            // No more data and stream ended
            break;
        }
    }

    Serial.printf("Playback complete: %d bytes played\n", totalBytesPlayed);

    // Cleanup
    if (audioRingBuffer) {
        vRingbufferDelete(audioRingBuffer);
        audioRingBuffer = nullptr;
    }

    isPlaying = false;
    isReceivingAudio = false;
    setLed(0, 255, 0);
    Serial.println("Playback task ended");
    playbackTaskHandle = nullptr;
    vTaskDelete(NULL);
}

void startStreamingPlayback(int expectedSize) {
    Serial.printf("Starting streaming playback: %d bytes expected\n", expectedSize);

    // Create ring buffer (64KB)
    audioRingBuffer = xRingbufferCreate(RING_BUFFER_SIZE, RINGBUF_TYPE_BYTEBUF);
    if (!audioRingBuffer) {
        Serial.println("Failed to create ring buffer!");
        setLed(255, 0, 0);
        return;
    }

    isReceivingAudio = true;
    audioStreamEnded = false;
    isPlaying = true;
    totalBytesReceived = 0;
    totalBytesPlayed = 0;
    setLed(0, 0, 255);  // Blue - receiving/playing

    // Start playback task
    xTaskCreatePinnedToCore(
        playbackTask,
        "playback",
        4096,
        NULL,
        5,
        &playbackTaskHandle,
        0
    );
}

void addToStreamingBuffer(uint8_t* data, size_t len) {
    if (!audioRingBuffer || !isReceivingAudio) return;

    // Send to ring buffer (non-blocking)
    if (xRingbufferSend(audioRingBuffer, data, len, pdMS_TO_TICKS(10)) == pdTRUE) {
        totalBytesReceived += len;
    } else {
        Serial.println("Ring buffer full!");
    }
}

void endAudioStream() {
    Serial.printf("Audio stream ended, received %d bytes\n", totalBytesReceived);
    audioStreamEnded = true;
}

// ==================== WEBSOCKET ====================
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket disconnected");
            wsConnected = false;
            if (!isRecording) setLed(255, 128, 0);
            break;

        case WStype_CONNECTED:
            Serial.println("WebSocket connected");
            wsConnected = true;
            setLed(0, 255, 0);
            break;

        case WStype_TEXT: {
            Serial.printf("Received: %s\n", payload);

            JsonDocument doc;
            DeserializationError error = deserializeJson(doc, payload);
            if (error) {
                Serial.println("JSON parse error");
                break;
            }

            const char* msgType = doc["type"];

            if (strcmp(msgType, "connected") == 0) {
                Serial.println("Backend ready");
            }
            else if (strcmp(msgType, "pong") == 0) {
                // Heartbeat
            }
            else if (strcmp(msgType, "audio_start") == 0) {
                int audioSize = doc["size"];
                const char* format = doc["format"] | "raw";
                Serial.printf("Receiving %s audio: %d bytes\n", format, audioSize);
                startStreamingPlayback(audioSize);
            }
            else if (strcmp(msgType, "audio_end") == 0) {
                endAudioStream();
            }
            else if (strcmp(msgType, "error") == 0) {
                Serial.printf("Backend error: %s\n", doc["message"].as<const char*>());
                isReceivingAudio = false;
                isPlaying = false;
                setLed(255, 0, 0);
                delay(1000);
                setLed(0, 255, 0);
            }
            break;
        }

        case WStype_BIN:
            // Audio chunk received - add to streaming buffer
            if (isReceivingAudio && length > 0) {
                addToStreamingBuffer(payload, length);
            }
            break;

        case WStype_ERROR:
            Serial.println("WebSocket error");
            break;

        default:
            break;
    }
}

void connectWebSocket() {
    String path = "/stream/" + device_id;
    Serial.println("Connecting to WebSocket: " + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + path);

    webSocket.begin(BACKEND_HOST, BACKEND_PORT, path.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

// ==================== AUDIO RECORDING ====================
void startRecording() {
    if (!recordBuffer) {
        recordBuffer = (uint8_t*)malloc(MAX_RECORD_BUFFER);
        if (!recordBuffer) {
            Serial.println("Failed to allocate record buffer!");
            setLed(255, 0, 0);
            return;
        }
    }

    isRecording = true;
    recordOffset = 0;
    setLed(255, 0, 0);  // Red - recording

    InitI2S(MODE_MIC);
    Serial.println("Recording started...");
}

void recordAudioChunk() {
    if (!isRecording || !recordBuffer) return;
    if (recordOffset >= MAX_RECORD_BUFFER - DATA_SIZE) return;

    size_t bytesRead;
    i2s_read(SPEAKER_I2S_NUMBER, recordBuffer + recordOffset, DATA_SIZE, &bytesRead, 100);
    recordOffset += bytesRead;
}

void stopRecordingAndSend() {
    isRecording = false;
    Serial.printf("Recording stopped: %d bytes\n", recordOffset);

    if (recordOffset < 1000) {
        Serial.println("Recording too short, ignoring");
        setLed(0, 255, 0);
        return;
    }

    setLed(255, 255, 0);  // Yellow - sending

    if (wsConnected) {
        int chunkSize = 1024;
        for (int i = 0; i < recordOffset; i += chunkSize) {
            int len = min(chunkSize, recordOffset - i);
            webSocket.sendBIN(recordBuffer + i, len);
            delay(5);
        }

        webSocket.sendTXT("{\"type\":\"speech_end\"}");
        Serial.println("Audio sent, waiting for response...");

        free(recordBuffer);
        recordBuffer = nullptr;
    } else {
        Serial.println("WebSocket not connected!");
        setLed(255, 0, 0);
    }
}

// ==================== SETUP ====================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n\nM5Atom Echo Voice Assistant (Streaming)");

    pinMode(BTN_PIN, INPUT_PULLUP);

    pixel.begin();
    pixel.setBrightness(50);
    setLed(255, 255, 0);

    initDeviceId();

    if (connectWiFi()) {
        connectWebSocket();
    }

    Serial.println("Ready - press button to talk");
}

// ==================== LOOP ====================
void loop() {
    webSocket.loop();

    bool buttonPressed = (digitalRead(BTN_PIN) == LOW);

    // Start recording when button pressed
    if (buttonPressed && !isRecording && !isPlaying && wsConnected) {
        startRecording();
    }

    // Continue recording while button held
    if (isRecording && buttonPressed) {
        recordAudioChunk();
    }

    // Stop recording and send when button released
    if (isRecording && !buttonPressed) {
        stopRecordingAndSend();
    }

    // Heartbeat every 30 seconds
    static unsigned long lastPing = 0;
    if (millis() - lastPing > 30000 && wsConnected) {
        webSocket.sendTXT("{\"type\":\"ping\"}");
        lastPing = millis();
    }

    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED && !isRecording && !isPlaying) {
        static unsigned long lastReconnect = 0;
        if (millis() - lastReconnect > 10000) {
            Serial.println("WiFi disconnected, reconnecting...");
            setLed(255, 128, 0);
            if (connectWiFi()) {
                connectWebSocket();
            }
            lastReconnect = millis();
        }
    }

    delay(1);
}
