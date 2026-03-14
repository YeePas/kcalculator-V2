function stripHtml(html: string) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const fetchCandidates = [
      target,
      'https://r.jina.ai/' + target,
      'https://r.jina.ai/http://' + target.replace(/^https?:\/\//i, ''),
      'https://r.jina.ai/https://' + target.replace(/^https?:\/\//i, ''),
    ];

    for (const candidate of fetchCandidates) {
      try {
        const upstream = await fetch(candidate, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; KcalculatorBot/1.0; +https://kcalculator.eu)',
          },
        });
        if (!upstream.ok) continue;
        const body = await upstream.text();
        const text = stripHtml(body).slice(0, 20000);
        if (!text) continue;
        return Response.json(
          {
            text,
            source: candidate === target ? 'supabase-direct' : 'supabase-r.jina.ai',
          },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json',
            },
          },
        );
      } catch {
        // Try the next candidate.
      }
    }

    return Response.json(
      { text: '', source: 'none', error: 'Could not fetch target URL' },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  }
});
