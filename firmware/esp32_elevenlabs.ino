#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <base64.h>
#include "config.h"

WebSocketsClient webSocket;

// Audio buffers
uint8_t micBuffer[AUDIO_BUFFER_SIZE];
int16_t audioSamples[AUDIO_BUFFER_SIZE / 2];
uint8_t speakerBuffer[AUDIO_BUFFER_SIZE * 2];

unsigned long lastAudioSend = 0;
bool isConnected = false;

void setup() {
  Serial.begin(115200);
  Serial.println("Starting ESP32 11labs Voice Agent...");

  // Connect to WiFi
  connectWiFi();

  // Initialize I2S for microphone
  setupMicrophone();

  // Initialize I2S for speaker
  setupSpeaker();

  // Connect to 11labs WebSocket
  connectWebSocket();
}

void loop() {
  webSocket.loop();

  if (isConnected) {
    // Send audio chunks periodically
    if (millis() - lastAudioSend > SEND_AUDIO_INTERVAL_MS) {
      captureAndSendAudio();
      lastAudioSend = millis();
    }
  }
}

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void connectWebSocket() {
  // Build WebSocket URL with agent_id
  String path = String(ELEVENLABS_WS_PATH) + "?agent_id=" + String(ELEVENLABS_AGENT_ID);

  Serial.println("Connecting to 11labs WebSocket...");
  webSocket.beginSSL(ELEVENLABS_WS_HOST, ELEVENLABS_WS_PORT, path.c_str());

  // Event handler
  webSocket.onEvent(webSocketEvent);

  // Heartbeat
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      isConnected = false;
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] Connected to 11labs");
      isConnected = true;
      break;

    case WStype_TEXT:
      Serial.printf("[WS] Received: %s\n", payload);
      handleWebSocketMessage((char*)payload, length);
      break;

    case WStype_BIN:
      Serial.println("[WS] Received binary data");
      break;

    case WStype_PING:
      Serial.println("[WS] Ping received");
      break;

    case WStype_PONG:
      Serial.println("[WS] Pong received");
      break;

    case WStype_ERROR:
      Serial.println("[WS] Error occurred");
      break;
  }
}

void handleWebSocketMessage(char* payload, size_t length) {
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  const char* type = doc["type"];

  if (strcmp(type, "conversation_initiation_metadata") == 0) {
    Serial.println("[11labs] Conversation initiated");
    const char* convId = doc["conversation_initiation_metadata_event"]["conversation_id"];
    Serial.printf("Conversation ID: %s\n", convId);
  }
  else if (strcmp(type, "audio") == 0) {
    Serial.println("[11labs] Received audio chunk");
    const char* audioBase64 = doc["audio_event"]["audio_base_64"];
    playAudio(audioBase64);
  }
  else if (strcmp(type, "user_transcript") == 0) {
    const char* transcript = doc["user_transcription_event"]["user_transcript"];
    Serial.printf("[User]: %s\n", transcript);
  }
  else if (strcmp(type, "agent_response") == 0) {
    const char* response = doc["agent_response_event"]["agent_response"];
    Serial.printf("[Agent]: %s\n", response);
  }
  else if (strcmp(type, "ping") == 0) {
    // Respond with pong
    sendPong(doc["ping_event"]["event_id"]);
  }
}

void setupMicrophone() {
  i2s_config_t i2s_config_mic = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config_mic = {
    .bck_io_num = I2S_MIC_SERIAL_CLOCK,
    .ws_io_num = I2S_MIC_LEFT_RIGHT_CLOCK,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_MIC_SERIAL_DATA
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config_mic, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config_mic);

  Serial.println("Microphone initialized");
}

void setupSpeaker() {
  i2s_config_t i2s_config_speaker = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config_speaker = {
    .bck_io_num = I2S_SPEAKER_SERIAL_CLOCK,
    .ws_io_num = I2S_SPEAKER_LEFT_RIGHT_CLOCK,
    .data_out_num = I2S_SPEAKER_SERIAL_DATA,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  i2s_driver_install(I2S_NUM_1, &i2s_config_speaker, 0, NULL);
  i2s_set_pin(I2S_NUM_1, &pin_config_speaker);

  Serial.println("Speaker initialized");
}

void captureAndSendAudio() {
  size_t bytesRead = 0;
  i2s_read(I2S_NUM_0, micBuffer, AUDIO_BUFFER_SIZE, &bytesRead, portMAX_DELAY);

  if (bytesRead > 0) {
    // Encode audio to base64
    String audioBase64 = base64::encode(micBuffer, bytesRead);

    // Create JSON message
    StaticJsonDocument<2048> doc;
    doc["user_audio_chunk"] = audioBase64;

    String message;
    serializeJson(doc, message);

    // Send via WebSocket
    webSocket.sendTXT(message);
  }
}

void playAudio(const char* audioBase64) {
  // Decode base64
  String decoded = base64::decode(String(audioBase64));

  size_t bytesWritten = 0;
  i2s_write(I2S_NUM_1, decoded.c_str(), decoded.length(), &bytesWritten, portMAX_DELAY);
}

void sendPong(const char* eventId) {
  StaticJsonDocument<256> doc;
  doc["type"] = "pong";
  doc["event_id"] = eventId;

  String message;
  serializeJson(doc, message);

  webSocket.sendTXT(message);
  Serial.println("[WS] Sent pong");
}
