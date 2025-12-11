"""
Voice Assistant MVP - Backend
Prostszy flow: Audio in → VAD detection → Send test.mp3 back
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
import asyncio
import time
from pathlib import Path

app = FastAPI(title="Voice Assistant MVP")

# Przechowujemy aktywne połączenia
active_connections = {}


@app.get("/")
async def root():
    return {
        "service": "Voice Assistant MVP",
        "version": "0.1.0",
        "active_devices": len(active_connections)
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/stream/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    """
    WebSocket endpoint dla M5Atom

    Flow:
    1. M5Atom łączy się z device_id
    2. Wysyła audio chunks (binary)
    3. M5Atom wykrywa koniec mowy (VAD) i wysyła sygnał "speech_end"
    4. Backend wysyła test.mp3 z powrotem
    """
    await websocket.accept()

    # Rejestracja urządzenia
    active_connections[device_id] = websocket
    print(f"✅ Device {device_id} connected (total: {len(active_connections)})")

    # Wyślij potwierdzenie
    await websocket.send_json({
        "type": "connected",
        "device_id": device_id,
        "message": "Backend ready"
    })

    audio_buffer = bytearray()

    try:
        while True:
            # Odbierz dane z urządzenia
            data = await websocket.receive()

            if "bytes" in data:
                # Audio chunk
                audio_chunk = data["bytes"]
                audio_buffer.extend(audio_chunk)
                print(f"📦 [{device_id}] Received {len(audio_chunk)} bytes (buffer: {len(audio_buffer)} bytes)")

            elif "text" in data:
                # Kontrolne wiadomości JSON
                import json
                msg = json.loads(data["text"])
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    print(f"💓 [{device_id}] Ping/Pong")

                elif msg_type == "speech_end":
                    # M5Atom wykrył koniec mowy - przetwórz
                    print(f"🎤 [{device_id}] Speech ended, buffer size: {len(audio_buffer)} bytes")
                    await process_speech(device_id, audio_buffer, websocket)
                    audio_buffer.clear()

                elif msg_type == "vad_speaking":
                    print(f"🗣️  [{device_id}] Started speaking")

                elif msg_type == "vad_silence":
                    print(f"🤫 [{device_id}] Silence detected")

    except WebSocketDisconnect:
        print(f"❌ Device {device_id} disconnected")

    except Exception as e:
        print(f"⚠️  Error with device {device_id}: {e}")

    finally:
        # Cleanup
        if device_id in active_connections:
            del active_connections[device_id]
        print(f"🧹 Cleaned up device {device_id} (remaining: {len(active_connections)})")


async def process_speech(device_id: str, audio_data: bytearray, websocket: WebSocket):
    """
    Przetwórz nagraną mowę

    Na razie: wysyłamy test audio (konwertowane do RAW)
    Później: STT → LLM → TTS
    """
    import subprocess
    import tempfile
    import os

    print(f"🔊 [{device_id}] Processing {len(audio_data)} bytes of audio")

    # Symuluj krótkie przetwarzanie
    await asyncio.sleep(0.5)

    # Szukamy pliku MP3 do konwersji
    test_audio_path = Path(__file__).parent / "voice.mp3"
    if not test_audio_path.exists():
        test_audio_path = Path(__file__).parent / "file_example_MP3_2MG.mp3"
    if not test_audio_path.exists():
        test_audio_path = Path(__file__).parent / "test.mp3"

    if not test_audio_path.exists():
        print(f"⚠️  No audio file found")
        await websocket.send_json({
            "type": "error",
            "message": "No audio file found"
        })
        return

    # Konwertuj MP3 do RAW (16kHz, 16-bit, mono) używając ffmpeg
    # Tylko pierwsze 10 sekund żeby nie przesyłać za dużo
    print(f"🔄 [{device_id}] Converting MP3 to RAW...")

    try:
        # Stream full audio - M5Atom uses ring buffer for real-time playback
        result = subprocess.run([
            "ffmpeg", "-y", "-i", str(test_audio_path),
            "-ar", "16000",  # 16kHz (speech quality)
            "-ac", "1",  # mono
            "-f", "s16le",  # 16-bit signed little-endian (RAW PCM)
            "-acodec", "pcm_s16le",
            "pipe:1"  # Output to stdout
        ], capture_output=True, check=True)
        raw_audio = result.stdout
    except subprocess.CalledProcessError as e:
        print(f"⚠️  FFmpeg error: {e.stderr.decode()}")
        await websocket.send_json({
            "type": "error",
            "message": "Audio conversion failed"
        })
        return

    print(f"📤 [{device_id}] Sending RAW audio ({len(raw_audio)} bytes)")

    # Wyślij sygnał że zaczynamy audio
    await websocket.send_json({
        "type": "audio_start",
        "format": "raw",
        "sample_rate": 16000,
        "bits": 16,
        "channels": 1,
        "size": len(raw_audio)
    })

    # Wyślij audio w chunkach - throttle to match 8kHz playback rate
    # 8kHz * 2 bytes = 16000 bytes/sec playback rate
    # Send slightly slower to avoid buffer overflow
    chunk_size = 1024  # 1KB chunks
    # 1KB at 16000 bytes/sec = 64ms per chunk, use 50ms to have headroom
    for i in range(0, len(raw_audio), chunk_size):
        chunk = raw_audio[i:i + chunk_size]
        await websocket.send_bytes(chunk)
        await asyncio.sleep(0.05)  # 50ms delay - matches ~20KB/s send rate

    # Sygnał końca audio
    await websocket.send_json({
        "type": "audio_end"
    })

    print(f"✅ [{device_id}] Finished sending audio")


@app.get("/admin/devices")
async def list_devices():
    """Lista aktywnych urządzeń"""
    return {
        "count": len(active_connections),
        "devices": list(active_connections.keys())
    }


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Voice Assistant MVP Backend")
    print("📍 WebSocket: ws://localhost:8005/stream/{device_id}")
    uvicorn.run(app, host="0.0.0.0", port=8005, log_level="info")
