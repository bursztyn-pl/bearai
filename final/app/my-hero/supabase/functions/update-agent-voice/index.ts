import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  console.log('[INFO] Update Agent Voice Edge Function');
  console.log('[INFO] Method:', req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!elevenLabsApiKey) {
      console.error('[ERROR] ELEVENLABS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { agent_id, voice_id } = body;

    console.log('[INFO] Request body:', { agent_id, voice_id });

    if (!agent_id || !voice_id) {
      return new Response(
        JSON.stringify({ error: 'Missing agent_id or voice_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[INFO] Fetching current agent config...');
    const getResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent_id}`, {
      headers: { 'xi-api-key': elevenLabsApiKey }
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error('[ERROR] Failed to get agent:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch agent', details: errorText }),
        { status: getResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentData = await getResponse.json();
    console.log('[INFO] Current agent name:', agentData.name);
    console.log('[INFO] Current voice_id:', agentData.conversation_config?.tts?.voice_id);

    console.log('[INFO] Updating agent voice to:', voice_id);
    const updateResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent_id}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_config: {
          tts: {
            voice_id: voice_id
          }
        }
      })
    });

    console.log('[INFO] Update response status:', updateResponse.status);

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[ERROR] Failed to update agent:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to update agent voice', details: errorText }),
        { status: updateResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const updatedAgent = await updateResponse.json();
    console.log('[SUCCESS] Agent voice updated successfully');
    console.log('[INFO] New voice_id:', updatedAgent.conversation_config?.tts?.voice_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Agent voice updated successfully',
        agent_id: agent_id,
        new_voice_id: voice_id,
        agent_name: updatedAgent.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[ERROR] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});