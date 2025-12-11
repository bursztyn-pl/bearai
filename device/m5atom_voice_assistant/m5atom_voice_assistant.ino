/*
 * M5Atom Echo - Voice Assistant MVP
 *
 * Features:
 * - WiFi Provisioning (Captive Portal)
 * - Unique Device ID (UUID)
 * - WebSocket connection to backend
 * - Audio streaming with VAD
 * - MP3 playback
 */

#include <M5Atom.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>

// ==================== CONFIG ====================
const char* AP_SSID = "BearAI-Setup";
const char* AP_PASSWORD = "12345678";

// I2S Configuration for M5Atom Echo
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 512

// VAD Configuration
#define VAD_SILENCE_THRESHOLD 1500  // ms ciszy = koniec mowy
#define VAD_AMPLITUDE_THRESHOLD 500 // Próg głośności

// ==================== GLOBALS ====================
Preferences preferences;
WebServer server(80);
DNSServer dnsServer;
WebSocketsClient webSocket;

String device_id;
String saved_ssid;
String saved_password;
String backend_host;
int backend_port;

bool wifiConfigured = false;
bool wsConnected = false;

// VAD state
bool isSpeaking = false;
unsigned long lastSoundTime = 0;

// ==================== HTML TEMPLATES ====================
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BearAI Setup</title>
    <style>
        body {
            font-family: Arial;
            max-width: 400px;
            margin: 50px auto;
            padding: 20px;
            background: #f0f0f0;
        }
        input, button {
            width: 100%;
            padding: 12px;
            margin: 8px 0;
            box-sizing: border-box;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        button {
            background: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover { background: #45a049; }
        h2 { color: #333; }
        .info {
            background: #e7f3fe;
            padding: 10px;
            border-left: 4px solid #2196F3;
            margin-bottom: 20px;
        }
        .device-id {
            background: #fff3cd;
            padding: 10px;
            border-left: 4px solid #ffc107;
            margin-bottom: 20px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h2>🐻 BearAI Setup</h2>
    <div class="device-id">
        Device ID: <strong>DEVICE_ID_PLACEHOLDER</strong>
    </div>
    <div class="info">
        Połącz urządzenie z WiFi i skonfiguruj backend
    </div>
    <form action="/save" method="POST">
        <label>WiFi SSID:</label>
        <input type="text" name="ssid" required placeholder="Nazwa sieci WiFi">

        <label>WiFi Password:</label>
        <input type="password" name="password" required placeholder="Hasło WiFi">

        <label>Backend Host:</label>
        <input type="text" name="backend_host" required
               placeholder="192.168.1.100"
               value="192.168.1.100">

        <label>Backend Port:</label>
        <input type="number" name="backend_port" required
               placeholder="8005"
               value="8005">

        <button type="submit">💾 Zapisz i połącz</button>
    </form>
</body>
</html>
)rawliteral";

const char success_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sukces!</title>
    <style>
        body {
            font-family: Arial;
            text-align: center;
            padding: 50px;
            background: #f0f0f0;
        }
        .success {
            background: #d4edda;
            color: #155724;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #c3e6cb;
            max-width: 400px;
            margin: 0 auto;
        }
        h2 { margin-top: 0; }
    </style>
</head>
<body>
    <div class="success">
        <h2>✅ Konfiguracja zapisana!</h2>
        <p>BearAI łączy się z siecią WiFi...</p>
        <p>Za chwilę możesz odłączyć się od tej sieci.</p>
    </div>
</body>
</html>
)rawliteral";

// ==================== SETUP ====================
void setup() {
    M5.begin(true, false, true);
    Serial.begin(115200);
    Serial.println("\n\n🐻 BearAI Voice Assistant Starting...");

    // Załaduj lub wygeneruj Device ID
    initDeviceId();

    // Załaduj konfigurację WiFi
    loadWiFiConfig();

    // Spróbuj połączyć się z zapisaną siecią
    if (saved_ssid.length() > 0) {
        Serial.println("Próba połączenia z zapisaną siecią: " + saved_ssid);
        wifiConfigured = connectToWiFi(saved_ssid, saved_password);
    }

    // Jeśli nie ma konfiguracji lub połączenie nie udało się
    if (!wifiConfigured) {
        Serial.println("Uruchamiam tryb konfiguracji (AP mode)...");
        startConfigMode();
    } else {
        Serial.println("✅ Połączono! IP: " + WiFi.localIP().toString());
        startNormalMode();
    }
}

// ==================== DEVICE ID ====================
void initDeviceId() {
    preferences.begin("device", false);
    device_id = preferences.getString("device_id", "");

    if (device_id.length() == 0) {
        // Wygeneruj UUID na podstawie MAC
        uint64_t chipid = ESP.getEfuseMac();
        device_id = String((uint32_t)(chipid >> 32), HEX) + String((uint32_t)chipid, HEX);
        preferences.putString("device_id", device_id);
        Serial.println("🆔 Generated new Device ID: " + device_id);
    } else {
        Serial.println("🆔 Loaded Device ID: " + device_id);
    }

    preferences.end();
}

// ==================== WIFI CONFIG ====================
void loadWiFiConfig() {
    preferences.begin("wifi-config", false);
    saved_ssid = preferences.getString("ssid", "");
    saved_password = preferences.getString("password", "");
    backend_host = preferences.getString("backend_host", "");
    backend_port = preferences.getInt("backend_port", 8005);
    preferences.end();
}

void saveWiFiConfig(String ssid, String password, String host, int port) {
    preferences.begin("wifi-config", false);
    preferences.putString("ssid", ssid);
    preferences.putString("password", password);
    preferences.putString("backend_host", host);
    preferences.putInt("backend_port", port);
    preferences.end();
}

bool connectToWiFi(String ssid, String password) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), password.c_str());

    Serial.print("Łączenie z WiFi");
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        // Migaj niebieskim
        M5.dis.drawpix(0, (attempts % 2) ? 0x0000ff : 0x000000);
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        M5.dis.drawpix(0, 0x00ff00);  // Zielony = połączono
        return true;
    }

    return false;
}

// ==================== CONFIG MODE (AP) ====================
void startConfigMode() {
    M5.dis.drawpix(0, 0xff0000);  // Czerwony = tryb konfiguracji

    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);

    Serial.println("📡 AP Mode");
    Serial.println("   SSID: " + String(AP_SSID));
    Serial.println("   Password: " + String(AP_PASSWORD));
    Serial.println("   IP: " + WiFi.softAPIP().toString());

    // DNS Server dla captive portal
    dnsServer.start(53, "*", WiFi.softAPIP());

    // Web server endpoints
    server.on("/", HTTP_GET, handleRoot);
    server.on("/save", HTTP_POST, handleSave);
    server.onNotFound(handleRoot);  // Captive portal redirect

    server.begin();
    Serial.println("✅ Web server uruchomiony!");
}

void handleRoot() {
    String html = String(index_html);
    html.replace("DEVICE_ID_PLACEHOLDER", device_id);
    server.send(200, "text/html", html);
}

void handleSave() {
    String ssid = server.arg("ssid");
    String password = server.arg("password");
    String host = server.arg("backend_host");
    int port = server.arg("backend_port").toInt();

    Serial.println("💾 Zapisuję konfigurację:");
    Serial.println("   SSID: " + ssid);
    Serial.println("   Backend: " + host + ":" + String(port));

    saveWiFiConfig(ssid, password, host, port);

    server.send(200, "text/html", success_html);

    delay(2000);
    ESP.restart();
}

// ==================== NORMAL MODE ====================
void startNormalMode() {
    Serial.println("🚀 Normal Mode - łączenie z backendem...");

    // Połącz WebSocket
    String wsPath = "/stream/" + device_id;
    webSocket.begin(backend_host.c_str(), backend_port, wsPath.c_str());
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);

    // TODO: Inicjalizacja I2S (mikrofon/głośnik)
    // initI2S();

    M5.dis.drawpix(0, 0x00ff00);  // Zielony = gotowy
}

// ==================== WEBSOCKET ====================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("❌ WebSocket disconnected");
            wsConnected = false;
            M5.dis.drawpix(0, 0xff0000);  // Czerwony
            break;

        case WStype_CONNECTED:
            Serial.println("✅ WebSocket connected");
            wsConnected = true;
            M5.dis.drawpix(0, 0x00ff00);  // Zielony
            break;

        case WStype_TEXT: {
            // JSON messages
            Serial.printf("📨 Received: %s\n", payload);

            // TODO: Parse JSON and handle different message types
            // - "connected": Backend potwierdzenie
            // - "audio_start": Zaczyna się odtwarzanie
            // - "audio_end": Koniec odtwarzania
            // - "error": Błąd
            break;
        }

        case WStype_BIN:
            // Audio chunk do odtworzenia
            Serial.printf("🔊 Received audio chunk: %d bytes\n", length);
            // TODO: playAudioChunk(payload, length);
            break;

        case WStype_ERROR:
            Serial.printf("⚠️  WebSocket error\n");
            break;
    }
}

// ==================== VAD (Simple) ====================
void checkVAD() {
    // TODO: Prawdziwa implementacja z I2S
    // Na razie placeholder - VAD będzie wykrywać koniec mowy

    // Przykładowa logika:
    // 1. Czytaj audio z mikrofonu
    // 2. Sprawdź amplitudę
    // 3. Jeśli głośne → isSpeaking = true, wysyłaj chunki
    // 4. Jeśli cisza przez VAD_SILENCE_THRESHOLD → wyślij "speech_end"
}

void sendAudioChunk(uint8_t* data, size_t length) {
    if (wsConnected) {
        webSocket.sendBIN(data, length);
    }
}

void sendSpeechEnd() {
    if (wsConnected) {
        webSocket.sendTXT("{\"type\":\"speech_end\"}");
        Serial.println("🎤 Sent speech_end signal");
    }
}

// ==================== LOOP ====================
void loop() {
    M5.update();

    if (!wifiConfigured) {
        // Tryb konfiguracji - obsługa web servera
        dnsServer.processNextRequest();
        server.handleClient();

        // Reset konfiguracji (przycisk)
        if (M5.Btn.wasPressed()) {
            Serial.println("🔄 Reset konfiguracji");
            preferences.begin("wifi-config", false);
            preferences.clear();
            preferences.end();
            ESP.restart();
        }
    } else {
        // Tryb normalny - obsługa WebSocket i audio
        webSocket.loop();

        // TODO: VAD + audio streaming
        // checkVAD();

        // Heartbeat co 30s
        static unsigned long lastPing = 0;
        if (millis() - lastPing > 30000) {
            if (wsConnected) {
                webSocket.sendTXT("{\"type\":\"ping\"}");
                lastPing = millis();
            }
        }

        // Reset konfiguracji (długie przytrzymanie)
        if (M5.Btn.pressedFor(5000)) {
            Serial.println("🔄 Reset do ustawień fabrycznych");
            preferences.begin("wifi-config", false);
            preferences.clear();
            preferences.end();
            ESP.restart();
        }
    }

    delay(10);
}
