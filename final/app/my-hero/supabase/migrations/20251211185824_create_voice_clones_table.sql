/*
  # Create voice clones table

  1. New Tables
    - `voice_clones`
      - `id` (uuid, primary key) - Unique identifier for each voice clone record
      - `voice_id` (text) - The voice ID returned from 11labs API
      - `voice_name` (text) - User-provided name for the voice clone
      - `created_at` (timestamptz) - Timestamp when the voice clone was created
      - `audio_size` (bigint) - Size of the audio file in bytes
      - `user_agent` (text) - Browser/device information for debugging

  2. Security
    - Enable RLS on `voice_clones` table
    - Add policy for public read access (for kids app)
    - Add policy for public insert access (for kids app)
  
  3. Notes
    - This is a simple kids app, so we're allowing public access
    - In production, you'd want proper authentication
*/

CREATE TABLE IF NOT EXISTS voice_clones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL,
  voice_name text NOT NULL,
  audio_size bigint DEFAULT 0,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE voice_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view voice clones"
  ON voice_clones
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create voice clones"
  ON voice_clones
  FOR INSERT
  TO public
  WITH CHECK (true);