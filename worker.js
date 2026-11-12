export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Cloud Edge API for PSA database state
    if (url.pathname === '/api/state') {
      const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      };

      if (request.method === 'GET') {
        try {
          const raw = await env.PSA_DATABASE.get('psa_workspace_state');
          if (!raw) {
            return new Response(
              JSON.stringify({
                clients: [],
                tickets: [],
                timeEntries: [],
                kbArticles: [],
                lastUpdatedEpoch: 0
              }),
              { status: 200, headers: corsHeaders }
            );
          }
          return new Response(raw, { status: 200, headers: corsHeaders });
        } catch (err) {
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: corsHeaders }
          );
        }
      }

      if (request.method === 'POST') {
        try {
          const bodyText = await request.text();
          const parsed = JSON.parse(bodyText);

          const cleanState = {
            clients: Array.isArray(parsed.clients) ? parsed.clients : [],
            tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
            timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : [],
            kbArticles: Array.isArray(parsed.kbArticles) ? parsed.kbArticles : [],
            lastUpdatedEpoch: Date.now()
          };

          const payloadStr = JSON.stringify(cleanState);
          await env.PSA_DATABASE.put('psa_workspace_state', payloadStr);

          return new Response(
            JSON.stringify({ success: true, lastUpdatedEpoch: cleanState.lastUpdatedEpoch }),
            { status: 200, headers: corsHeaders }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 400, headers: corsHeaders }
          );
        }
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders
      });
    }

    // Fallback: serve static assets via Cloudflare Assets
    return env.ASSETS.fetch(request);
  }
};
