export {};

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type UpdateRequest = {
  id?: number;
  status?: 'open' | 'triaged' | 'resolved' | string;
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

function parseAdminEmails() {
  return getEnv('ADMIN_EMAILS')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
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

function assertAdminEmail(email: string, allowlist: string[]) {
  if (!email) throw new Error('Niet ingelogd');
  if (!allowlist.includes(email.toLowerCase())) throw new Error('Geen adminrechten');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = getEnv('SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const adminEmails = parseAdminEmails();

    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Supabase env ontbreekt');
    if (!adminEmails.length) throw new Error('ADMIN_EMAILS env ontbreekt');

    const authHeader = req.headers.get('Authorization') || '';
    const user = await getCurrentUser(supabaseUrl, anonKey, authHeader);
    const userEmail = String(user?.email || '').toLowerCase();
    assertAdminEmail(userEmail, adminEmails);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const status = String(url.searchParams.get('status') || 'all');
      const clauses = ['select=id,created_at,user_id,user_email_hint,context,message,severity,status,details,page_path,report_date,meal'];
      if (status !== 'all') clauses.push(`status=eq.${encodeURIComponent(status)}`);
      clauses.push('order=created_at.desc');
      clauses.push('limit=200');
      const restUrl = `${supabaseUrl}/rest/v1/issue_reports?${clauses.join('&')}`;

      const response = await fetch(restUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      const issues = await response.json().catch(() => []);
      if (!response.ok) throw new Error(issues?.message || 'Kon issues niet laden');
      return json({ issues });
    }

    if (req.method === 'POST') {
      const body = await req.json() as UpdateRequest;
      const id = Number(body?.id);
      const status = String(body?.status || '').toLowerCase();
      if (!Number.isFinite(id) || id <= 0) return json({ error: 'Ongeldig issue id' }, 400);
      if (!['open', 'triaged', 'resolved'].includes(status)) return json({ error: 'Ongeldige status' }, 400);

      const patch = {
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        resolved_by: status === 'resolved' ? String(user?.id || null) : null,
      };

      const response = await fetch(`${supabaseUrl}/rest/v1/issue_reports?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
      });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(rows?.message || 'Update mislukt');

      return json({ ok: true, issue: rows?.[0] || null });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
