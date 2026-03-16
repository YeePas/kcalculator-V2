type SaveRequest = {
  provider?: string;
  key?: string | null;
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

function assertProvider(provider: string) {
  if (!['claude', 'gemini', 'openai'].includes(provider)) {
    throw new Error('Ongeldige provider');
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptApiKey(secret: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return {
    encrypted_key: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function getCurrentUser(baseUrl: string, anonKey: string, authHeader: string) {
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      'apikey': anonKey,
      'Authorization': authHeader,
    },
  });
  if (!response.ok) throw new Error('Niet ingelogd');
  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
    const encryptionSecret = getEnv('AI_KEY_ENCRYPTION_SECRET');
    const authHeader = req.headers.get('Authorization') || '';
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase env ontbreekt');
    if (!encryptionSecret) throw new Error('Supabase secret AI_KEY_ENCRYPTION_SECRET ontbreekt');
    if (!authHeader.startsWith('Bearer ')) throw new Error('Niet ingelogd');

    const body = await req.json() as SaveRequest;
    const provider = String(body.provider || '').trim().toLowerCase();
    const inputKey = String(body.key || '').trim();
    assertProvider(provider);

    const user = await getCurrentUser(supabaseUrl, supabaseAnonKey, authHeader);
    const userId = String(user?.id || '');
    if (!userId) throw new Error('Gebruiker niet gevonden');

    if (!inputKey) {
      const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/user_ai_keys?user_id=eq.${userId}&provider=eq.${provider}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': authHeader,
        },
      });
      if (!deleteResponse.ok) {
        const deletePayload = await deleteResponse.json().catch(() => ({}));
        throw new Error(deletePayload?.message || 'Verwijderen mislukt');
      }
      return json({ ok: true, provider, stored: false });
    }

    const encrypted = await encryptApiKey(encryptionSecret, inputKey);
    const saveResponse = await fetch(`${supabaseUrl}/rest/v1/user_ai_keys?on_conflict=user_id,provider`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        provider,
        encrypted_key: encrypted.encrypted_key,
        iv: encrypted.iv,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!saveResponse.ok) {
      const savePayload = await saveResponse.json().catch(() => ({}));
      throw new Error(savePayload?.message || 'Opslaan mislukt');
    }

    return json({ ok: true, provider, stored: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
