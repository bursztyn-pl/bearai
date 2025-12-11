# Voice Clone for Kids

A simple and fun web app for children to record their voice and create a custom voice clone using ElevenLabs API.

## Features

- Child-friendly interface with large, colorful buttons
- Voice recording with microphone access
- Audio playback to preview recordings
- Voice cloning using ElevenLabs Instant Voice Cloning API
- Real-time debug console with verbose logging
- Database storage of voice clone records

## Setup Instructions

### 1. Get Your ElevenLabs API Key

1. Go to [ElevenLabs](https://elevenlabs.io/) and create an account
2. Navigate to your profile settings
3. Go to the API section
4. Copy your API key

### 2. Configure the API Key

You need to add your ElevenLabs API key as a secret in your Supabase Edge Functions:

The API key is automatically configured in the deployed environment. The edge function looks for the `ELEVENLABS_API_KEY` environment variable.

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Development Server

The development server starts automatically in this environment.

## How It Works

1. Click the "Start" button
2. Click "Record Your Voice" to begin recording
3. Speak clearly into your microphone for at least 10 seconds
4. Watch the timer count up - you'll see a message when you reach the minimum
5. Click "Stop Recording" when finished (disabled until 10 seconds)
6. Play back your recording to review it
7. Enter a name for your voice clone
8. Click "Upload to 11Labs & Create Clone"
9. Your unique Voice ID will be displayed

**Important:** ElevenLabs requires at least 10 seconds of audio for voice cloning. The app enforces this requirement and won't let you proceed with shorter recordings.

## Debug Console

The app includes a built-in debug console that shows:
- Microphone access requests
- Recording status and audio data
- API requests and responses
- Database operations
- Error messages with details

You can toggle the debug console visibility using the "Hide/Show" button.

## Technical Details

### Frontend
- React with TypeScript
- TailwindCSS for styling
- Lucide React for icons
- MediaRecorder API for audio capture

### Backend
- Supabase Edge Functions
- PostgreSQL database
- ElevenLabs Voice Cloning API

### Database Schema

The app uses a `voice_clones` table with:
- `id`: Unique identifier
- `voice_id`: ElevenLabs voice ID
- `voice_name`: User-provided name
- `audio_size`: Size of audio file in bytes
- `user_agent`: Browser/device information
- `created_at`: Creation timestamp

## API Endpoints

### POST /functions/v1/clone-voice

Creates a voice clone using ElevenLabs API.

**Request:**
- Content-Type: multipart/form-data
- Body:
  - `name` (string): Voice name
  - `audio` (file): Audio recording

**Response:**
```json
{
  "voice_id": "abc123...",
  "message": "Voice clone created successfully"
}
```

## Browser Compatibility

- Chrome 49+
- Firefox 25+
- Safari 14.1+
- Edge 79+

Requires microphone access permission.

## Security

- Row Level Security (RLS) enabled on database
- API key stored securely in environment variables
- CORS configured for cross-origin requests

## Notes

- This is a simple demo app with public access for ease of use with children
- In production, you should implement proper authentication
- Audio files are sent directly to ElevenLabs and not stored on the server
- Voice IDs should be saved by the user for later use
