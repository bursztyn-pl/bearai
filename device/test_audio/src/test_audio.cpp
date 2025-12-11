/*
 * M5Atom Echo - Mic Test with M5Unified
 * Hold button to record, release to playback
 *
 * CRITICAL: Mic and Speaker CANNOT work simultaneously!
 * Must call M5.Mic.end() before M5.Speaker.begin() and vice versa.
 */

#include <M5Unified.h>
#include "audio_data.h"  // Test audio from flash

// Recording settings
static constexpr size_t SAMPLE_RATE = 16000;
static constexpr size_t RECORD_SECONDS = 3;
static constexpr size_t RECORD_SIZE = SAMPLE_RATE * RECORD_SECONDS;
static constexpr size_t CHUNK_SIZE = 256;

int16_t* rec_data = nullptr;
size_t rec_index = 0;

void setup() {
    auto cfg = M5.config();
    cfg.serial_baudrate = 115200;

    // Enable internal mic and speaker for ATOM Echo
    cfg.internal_mic = true;
    cfg.internal_spk = true;

    M5.begin(cfg);

    Serial.println("\n================================");
    Serial.println("M5Atom Echo - Mic Test v3");
    Serial.println("Mic/Speaker switching version");
    Serial.println("================================");

    // Allocate recording buffer
    rec_data = (int16_t*)heap_caps_malloc(RECORD_SIZE * sizeof(int16_t), MALLOC_CAP_8BIT);
    if (rec_data == nullptr) {
        Serial.println("ERROR: Failed to allocate buffer!");
        while(1) { delay(1000); }
    }

    Serial.printf("Buffer: %d samples (%.1f sec)\n", RECORD_SIZE, (float)RECORD_SIZE / SAMPLE_RATE);
    Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());

    // Start with speaker enabled for startup beep
    M5.Speaker.begin();
    M5.Speaker.setVolume(200);

    Serial.printf("Speaker enabled: %s\n", M5.Speaker.isEnabled() ? "YES" : "NO");

    // Startup beeps
    M5.Speaker.tone(1000, 100);
    delay(150);
    M5.Speaker.tone(1500, 100);
    delay(200);

    // Now switch to mic mode
    M5.Speaker.end();
    M5.Mic.begin();

    Serial.printf("Mic enabled: %s\n", M5.Mic.isEnabled() ? "YES" : "NO");

    Serial.println("\nReady!");
    Serial.println("- Single click: record/play");
    Serial.println("- Double click: play test audio from flash\n");
}

void loop() {
    M5.update();

    // Button pressed - start recording
    if (M5.BtnA.wasPressed()) {
        Serial.println("=== RECORDING ===");

        // Make sure mic is active
        if (!M5.Mic.isEnabled()) {
            M5.Speaker.end();
            M5.Mic.begin();
        }

        // Clear buffer
        memset(rec_data, 0, RECORD_SIZE * sizeof(int16_t));
        rec_index = 0;

        // Record while button is pressed
        while (M5.BtnA.isPressed() && rec_index < RECORD_SIZE) {
            M5.update();

            size_t to_record = CHUNK_SIZE;
            if (rec_index + to_record > RECORD_SIZE) {
                to_record = RECORD_SIZE - rec_index;
            }

            // Record chunk
            if (M5.Mic.record(rec_data + rec_index, to_record, SAMPLE_RATE)) {
                while (M5.Mic.isRecording()) {
                    delay(1);
                }
                rec_index += to_record;

                // Progress indicator
                if ((rec_index % 8000) < CHUNK_SIZE) {
                    Serial.printf("  Recording: %.1f sec\n", (float)rec_index / SAMPLE_RATE);
                }
            }
        }

        Serial.printf("Recorded: %d samples (%.2f sec)\n", rec_index, (float)rec_index / SAMPLE_RATE);

        // Analyze audio
        if (rec_index > 1000) {
            int16_t maxVal = -32768;
            int16_t minVal = 32767;
            int64_t sum = 0;

            for (size_t i = 0; i < rec_index; i++) {
                if (rec_data[i] > maxVal) maxVal = rec_data[i];
                if (rec_data[i] < minVal) minVal = rec_data[i];
                sum += abs(rec_data[i]);
            }

            int16_t peakToPeak = maxVal - minVal;
            Serial.printf("Audio: min=%d, max=%d, p2p=%d, avg=%lld\n", minVal, maxVal, peakToPeak, sum / rec_index);

            if (peakToPeak < 1000) {
                Serial.println("WARNING: Very low signal!");
            }

            // Normalize audio - boost quiet recordings
            if (peakToPeak > 100 && peakToPeak < 15000) {
                float gain = 25000.0f / peakToPeak;
                if (gain > 5.0f) gain = 5.0f;  // Max 5x boost
                if (gain > 1.3f) {
                    Serial.printf("Boosting audio %.1fx\n", gain);
                    for (size_t i = 0; i < rec_index; i++) {
                        int32_t sample = (int32_t)(rec_data[i] * gain);
                        if (sample > 32767) sample = 32767;
                        if (sample < -32768) sample = -32768;
                        rec_data[i] = (int16_t)sample;
                    }
                }
            }

            // CRITICAL: Switch from mic to speaker
            Serial.println("Switching to speaker...");
            M5.Mic.end();
            delay(50);  // Give time for I2S to release
            M5.Speaker.begin();
            M5.Speaker.setVolume(255);  // Max volume

            delay(50);

            // Playback
            Serial.println("=== PLAYBACK ===");
            M5.Speaker.playRaw(rec_data, rec_index, SAMPLE_RATE, false, 1, 0);

            while (M5.Speaker.isPlaying()) {
                delay(10);
            }

            Serial.println("Playback done.");

            // Done beeps
            delay(100);
            M5.Speaker.tone(800, 50);
            delay(70);
            M5.Speaker.tone(1200, 50);
            delay(100);

            // Switch back to mic mode
            Serial.println("Switching back to mic...");
            M5.Speaker.end();
            delay(50);
            M5.Mic.begin();

        } else {
            Serial.println("Recording too short!");
        }

        Serial.println("\nReady.\n");
    }

    // Double click - play test audio from flash
    if (M5.BtnA.wasDoubleClicked()) {
        Serial.println("=== PLAYING TEST AUDIO FROM FLASH ===");
        Serial.printf("Size: %d bytes (%.1f sec)\n", test_raw_len, (float)test_raw_len / 2 / SAMPLE_RATE);

        // Switch to speaker
        M5.Mic.end();
        delay(50);
        M5.Speaker.begin();
        M5.Speaker.setVolume(255);

        delay(50);

        // Copy from PROGMEM to RAM for playback
        int16_t* audio_buf = (int16_t*)heap_caps_malloc(test_raw_len, MALLOC_CAP_8BIT);
        if (audio_buf) {
            memcpy_P(audio_buf, test_raw, test_raw_len);

            M5.Speaker.playRaw(audio_buf, test_raw_len / 2, SAMPLE_RATE, false, 1, 0);

            while (M5.Speaker.isPlaying()) {
                delay(10);
            }

            free(audio_buf);
            Serial.println("Playback done.");
        } else {
            Serial.println("ERROR: Cannot allocate buffer!");
        }

        // Switch back to mic
        M5.Speaker.end();
        delay(50);
        M5.Mic.begin();

        Serial.println("\nReady.\n");
    }

    delay(10);
}
