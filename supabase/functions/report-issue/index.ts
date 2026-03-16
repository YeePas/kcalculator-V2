export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type IssueRequest = {
  context?: string;
  message?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  details?: Record<string, unknown>;
  page_path?: string;
  current_date?: string;
  meal?: string;
  created_at_client?: string;
  user_agent?: string;
  user_email_hint?: string | null;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function getEnv(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

async function getCurrentUser(baseUrl: string, anonKey: string, authHeader: string) {
  if (!authHeader.startsWith('Bearer ')) return null;
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: authHeader,
    },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = getEnv('SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Supabase env ontbreekt voor issue logging');
    }

    const body = await req.json() as IssueRequest;
    const message = String(body?.message || '').trim();
    if (!message) return json({ error: 'Missing message' }, 400);

    const severity = String(body?.severity || 'medium').toLowerCase();
    const normalizedSeverity = ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium';

    const authHeader = req.headers.get('Authorization') || '';
    const user = await getCurrentUser(supabaseUrl, anonKey, authHeader);
    const userId = String(user?.id || '');

    const payload = {
      user_id: userId || null,
      context: String(body?.context || 'unknown').slice(0, 120),
      message: message.slice(0, 5000),
      severity: normalizedSeverity,
      details: body?.details || {},
      page_path: String(body?.page_path || '').slice(0, 200),
      report_date: String(body?.current_date || '').slice(0, 20),
      meal: String(body?.meal || '').slice(0, 40),
      created_at_client: String(body?.created_at_client || '').slice(0, 40),
      user_agent: String(body?.user_agent || '').slice(0, 500),
      user_email_hint: body?.user_email_hint ? String(body.user_email_hint).slice(0, 200) : null,
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/issue_reports`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(result?.message || 'Issue logging failed');
    }

    return json({ ok: true, id: result?.[0]?.id || null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
