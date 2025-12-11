# 🐻 BearAI - Voice Assistant MVP

Minimalistyczny asystent głosowy oparty na M5Atom Echo.

## 🎯 Cel MVP

Przetestować cały flow audio bez kosztownych API (STT/LLM/TTS):

1. Mówisz do mikrofonu M5Atom
2. M5Atom dzieli dźwięk na chunki + wykrywa koniec mowy (VAD)
3. Wysyła do backendu przez WebSocket
4. Backend wykrywa przerwę w mówieniu
5. Backend odsyła prosty plik `test.mp3`
6. M5Atom odtwarza przez głośnik

## 📁 Struktura projektu

```
bearAI/
├── backend/
│   ├── main.py              # FastAPI + WebSocket
│   ├── test.mp3             # Testowy plik audio (dodaj własny!)
│   └── requirements.txt
└── device/
    └── m5atom_voice_assistant/
        └── m5atom_voice_assistant.ino  # Arduino sketch
```

## 🚀 Quick Start

### Backend (Python)

```bash
cd backend

# Utwórz virtual env
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# lub: venv\Scripts\activate  # Windows

# Zainstaluj zależności
pip install -r requirements.txt

# Dodaj plik test.mp3 (jakikolwiek krótki MP3)
# np. pobierz z: https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3

# Uruchom serwer
python main.py
```

Backend uruchomi się na `http://0.0.0.0:8005`

Sprawdź:
- http://localhost:8005 - Status
- http://localhost:8005/health - Health check
- http://localhost:8005/admin/devices - Lista urządzeń

### Device (M5Atom Echo)

#### Wymagania

1. **M5Atom Echo** (ESP32 + mikrofon + głośnik)
2. **Arduino IDE** z zainstalowanymi:
   - Board: ESP32 (https://github.com/espressif/arduino-esp32)
   - Library: M5Atom (by M5Stack)
   - Library: WebSockets (by Markus Sattler)

#### Instalacja

1. Otwórz Arduino IDE
2. Załaduj `device/m5atom_voice_assistant/m5atom_voice_assistant.ino`
3. Wybierz Board: **M5Stack-ATOM**
4. Wgraj na urządzenie (Upload)

#### Pierwsza konfiguracja

1. Po uruchomieniu M5Atom wystawia WiFi:
   - SSID: `BearAI-Setup`
   - Password: `12345678`
   - LED świeci na **czerwono**

2. Połącz się telefonem/komputerem do `BearAI-Setup`

3. Otwórz przeglądarkę → automatycznie przekieruje do formularza
   (Lub ręcznie: `http://192.168.4.1`)

4. Wypełnij formularz:
   - **WiFi SSID**: Nazwa twojej sieci domowej
   - **WiFi Password**: Hasło do WiFi
   - **Backend Host**: IP komputera z backendem (np. `192.168.1.100`)
   - **Backend Port**: `8005`

5. Kliknij **Zapisz i połącz**

6. M5Atom się zrestartuje i połączy z WiFi + backendem
   - LED świeci na **zielono** = połączono!

#### Reset konfiguracji

- **Krótkie przytrzymanie przycisku** (tryb AP): Kasuje konfigurację i restartuje
- **Długie przytrzymanie 5s** (tryb normalny): Reset do ustawień fabrycznych

## 🔍 Jak to działa?

### Flow

```
┌─────────┐                 ┌─────────┐
│ M5Atom  │                 │ Backend │
│  Echo   │                 │ FastAPI │
└────┬────┘                 └────┬────┘
     │                           │
     │ 1. WebSocket Connect      │
     │──────────────────────────>│
     │                           │
     │ 2. {"type":"connected"}   │
     │<──────────────────────────│
     │                           │
     │ 3. Audio chunks (binary)  │
     │──────────────────────────>│
     │──────────────────────────>│
     │──────────────────────────>│
     │                           │
     │ 4. {"type":"speech_end"}  │
     │──────────────────────────>│
     │                           │
     │   [Backend wczytuje       │
     │    test.mp3]              │
     │                           │
     │ 5. {"type":"audio_start"} │
     │<──────────────────────────│
     │                           │
     │ 6. MP3 chunks (binary)    │
     │<──────────────────────────│
     │<──────────────────────────│
     │<──────────────────────────│
     │                           │
     │ 7. {"type":"audio_end"}   │
     │<──────────────────────────│
     │                           │
     └───────────────────────────┘
```

### Identyfikacja urządzeń

Każde M5Atom ma unikalny **Device ID** generowany z MAC:
- Generowany przy pierwszym uruchomieniu
- Zapisywany w NVRAM (trwale)
- Format: `a4cf12fd89ab`
- Wysyłany w ścieżce WebSocket: `/stream/{device_id}`

Backend przechowuje aktywne połączenia w słowniku:
```python
active_connections = {
    "a4cf12fd89ab": <WebSocket>,
    "b5de23fe90cd": <WebSocket>,
    ...
}
```

## 🛠️ Co dalej?

### Następne kroki (po MVP):

1. **Implementacja I2S** na M5Atom:
   - Nagrywanie z mikrofonu
   - Odtwarzanie przez głośnik
   - Prawdziwy VAD (wykrywanie głosu)

2. **STT (Speech-to-Text)**:
   - OpenAI Whisper API
   - Lub Deepgram (szybszy)

3. **LLM**:
   - Claude/GPT-4
   - Kontekst konwersacji

4. **TTS (Text-to-Speech)**:
   - 11labs streaming
   - Lub OpenAI TTS

5. **Baza danych**:
   - PostgreSQL: urządzenia, konwersacje, wiadomości
   - Redis: sesje, cache kontekstu

6. **Monitoring**:
   - Metryki (latencja STT/LLM/TTS)
   - Dashboard (Grafana)
   - Logi (Loki/ELK)

## 📊 Testowanie

### Backend

```bash
# Terminal 1: Uruchom backend
python main.py

# Terminal 2: Lista urządzeń
curl http://localhost:8005/admin/devices
```

### M5Atom

1. Wgraj kod na urządzenie
2. Otwórz Serial Monitor (115200 baud)
3. Zobacz logi połączenia

## 🐛 Debugging

### M5Atom nie łączy się z WiFi
- Sprawdź SSID/hasło w Serial Monitor
- Upewnij się że WiFi to 2.4GHz (ESP32 nie obsługuje 5GHz)

### M5Atom nie łączy się z backendem
- Sprawdź czy backend jest uruchomiony
- Sprawdź IP hosta (może się zmienić po restarcie routera)
- Sprawdź firewall (port 8005)

### Backend nie odbiera audio
- Sprawdź logi backend: powinny pojawić się chunki audio
- Sprawdź logi M5Atom: czy WebSocket connected?

## 📝 Licencja

MIT
# bearai
