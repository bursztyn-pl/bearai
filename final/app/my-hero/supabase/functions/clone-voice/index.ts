import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VoiceCloneResponse {
  voice_id: string;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  console.log('[INFO] ==========================================');
  console.log('[INFO] Voice Clone Edge Function');
  console.log('[INFO] Timestamp:', new Date().toISOString());
  console.log('[INFO] Method:', req.method);
  console.log('[INFO] Path:', url.pathname);
  console.log('[INFO] ==========================================');

  if (req.method === "OPTIONS") {
    console.log('[INFO] Handling OPTIONS preflight request');
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method === "GET") {
    console.log('[INFO] Health check request');
    const apiKeyConfigured = !!Deno.env.get('ELEVENLABS_API_KEY');
    console.log('[INFO] ELEVENLABS_API_KEY configured:', apiKeyConfigured);
    
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'clone-voice',
        timestamp: new Date().toISOString(),
        config: {
          elevenlabs_api_key_configured: apiKeyConfigured,
          supabase_url_configured: !!Deno.env.get('SUPABASE_URL'),
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    console.log('[INFO] Processing voice clone request...');
    console.log('[INFO] Parsing form data...');
    
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const audioFile = formData.get('audio') as File;

    console.log('[INFO] Form data parsed:');
    console.log('[INFO]   - Voice name:', name);
    console.log('[INFO]   - Audio file present:', !!audioFile);
    console.log('[INFO]   - Audio file size:', audioFile?.size, 'bytes');
    console.log('[INFO]   - Audio file type:', audioFile?.type);
    console.log('[INFO]   - Audio file name:', audioFile?.name);

    if (!name || !audioFile) {
      console.error('[ERROR] Missing required fields');
      console.error('[ERROR]   - name:', !!name);
      console.error('[ERROR]   - audioFile:', !!audioFile);
      return new Response(
        JSON.stringify({ 
          error: 'Missing name or audio file',
          details: {
            name_provided: !!name,
            audio_provided: !!audioFile
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    console.log('[INFO] Checking ELEVENLABS_API_KEY...');
    console.log('[INFO] API key configured:', !!elevenLabsApiKey);
    console.log('[INFO] API key length:', elevenLabsApiKey?.length || 0);
    
    if (!elevenLabsApiKey) {
      console.error('[ERROR] ELEVENLABS_API_KEY not configured!');
      console.error('[ERROR] Please add your ElevenLabs API key to the Supabase secrets');
      return new Response(
        JSON.stringify({ 
          error: 'ElevenLabs API key not configured',
          details: 'The ELEVENLABS_API_KEY environment variable is not set. Please configure it in your Supabase project settings under Edge Functions > Secrets.',
          help: 'Get your API key from https://elevenlabs.io/app/settings/api-keys'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[INFO] Preparing ElevenLabs API request...');
    console.log('[INFO] Endpoint: https://api.elevenlabs.io/v1/voices/add');
    
    const elevenLabsFormData = new FormData();
    elevenLabsFormData.append('name', name);
    elevenLabsFormData.append('files', audioFile, audioFile.name || 'recording.webm');

    console.log('[INFO] FormData prepared:');
    console.log('[INFO]   - name:', name);
    console.log('[INFO]   - files: [audio file]');

    console.log('[INFO] Sending request to ElevenLabs API...');
    const startTime = Date.now();
    
    const elevenLabsResponse = await fetch(
      'https://api.elevenlabs.io/v1/voices/add',
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
        },
        body: elevenLabsFormData,
      }
    );

    const responseTime = Date.now() - startTime;
    console.log('[INFO] ElevenLabs API responded in', responseTime, 'ms');
    console.log('[INFO] Response status:', elevenLabsResponse.status);
    console.log('[INFO] Response status text:', elevenLabsResponse.statusText);
    
    const responseText = await elevenLabsResponse.text();
    console.log('[INFO] Response body:', responseText);

    if (!elevenLabsResponse.ok) {
      console.error('[ERROR] ElevenLabs API returned error!');
      console.error('[ERROR] Status:', elevenLabsResponse.status);
      console.error('[ERROR] Body:', responseText);
      
      let errorDetails = responseText;
      try {
        const parsed = JSON.parse(responseText);
        errorDetails = parsed.detail?.message || parsed.detail || parsed.message || responseText;
      } catch {
        // keep original text
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'ElevenLabs API error',
          status: elevenLabsResponse.status,
          details: errorDetails,
          help: elevenLabsResponse.status === 401 
            ? 'Invalid API key. Check your ELEVENLABS_API_KEY.' 
            : elevenLabsResponse.status === 422 
            ? 'Invalid audio file. Make sure recording is at least 10 seconds and clear.'
            : 'Check the ElevenLabs dashboard for more details.'
        }),
        {
          status: elevenLabsResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[SUCCESS] ElevenLabs API request successful!');
    
    let voiceData: VoiceCloneResponse;
    try {
      voiceData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[ERROR] Failed to parse response:', parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse ElevenLabs response',
          details: responseText
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    console.log('[SUCCESS] Voice clone created!');
    console.log('[SUCCESS] Voice ID:', voiceData.voice_id);

    console.log('[INFO] Storing voice clone data in database...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: dbData, error: dbError } = await supabase
      .from('voice_clones')
      .insert({
        voice_id: voiceData.voice_id,
        voice_name: name,
        audio_size: audioFile.size,
        user_agent: req.headers.get('user-agent') || 'unknown',
      })
      .select();

    if (dbError) {
      console.error('[ERROR] Database insert error:', dbError);
      console.error('[ERROR] This is non-fatal, voice was still created');
    } else {
      console.log('[SUCCESS] Voice clone data stored in database');
      console.log('[INFO] Database record:', dbData);
    }

    console.log('[SUCCESS] ==========================================');
    console.log('[SUCCESS] Voice clone request completed successfully!');
    console.log('[SUCCESS] Voice ID:', voiceData.voice_id);
    console.log('[SUCCESS] ==========================================');
    
    return new Response(
      JSON.stringify({ 
        voice_id: voiceData.voice_id,
        message: 'Voice clone created successfully!',
        voice_name: name
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[ERROR] ==========================================');
    console.error('[ERROR] Unexpected error in voice clone function!');
    console.error('[ERROR] Error:', error);
    console.error('[ERROR] Stack:', error instanceof Error ? error.stack : 'N/A');
    console.error('[ERROR] ==========================================');
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.name : 'Unknown'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});