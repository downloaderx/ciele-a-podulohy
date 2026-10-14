import { cookies } from 'next/headers';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function authMode(): 'profiles' | 'supabase' {
  const mode = process.env.APP_AUTH_MODE ?? 'profiles';
  if (mode !== 'profiles' && mode !== 'supabase') throw new ApiError(503, 'Neplatné nastavenie režimu prihlásenia.');
  return mode;
}

export function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey) throw new ApiError(503, 'Úložisko nie je nakonfigurované.');
  return { url, serviceKey, authKey };
}

export async function supabase(path: string, init: RequestInit = {}, auth = false) {
  const { url, serviceKey, authKey } = config();
  if (auth && !authKey) throw new ApiError(503, 'Prihlásenie nie je nakonfigurované. Chýba SUPABASE_ANON_KEY.');
  const key = auth ? authKey! : serviceKey;
  try {
    return await fetch(`${url}${path}`, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { apikey: key, authorization: `Bearer ${key}`,
        'content-type': 'application/json', ...init.headers },
    });
  } catch { throw new ApiError(503, 'Server úložiska je nedostupný. Skúste znova.'); }
}

type Tokens = { access_token: string; refresh_token: string; expires_in: number };
export async function saveTokens(tokens: Tokens) {
  const jar = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
  jar.set('acorns-access', tokens.access_token, { ...options, maxAge: tokens.expires_in });
  jar.set('acorns-refresh', tokens.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete('acorns-access'); jar.delete('acorns-refresh');
  jar.delete('acorns-profile');
}

export async function selectProfile(personId: unknown) {
  if (authMode() !== 'profiles') throw new ApiError(403, 'Prihláste sa cez Supabase účet.');
  if (personId !== 'person-1' && personId !== 'person-2') throw new ApiError(400, 'Vyberte platnú líštičku.');
  const jar = await cookies();
  jar.set('acorns-profile', personId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return personId;
}

export async function signOut() {
  const jar = await cookies();
  const access = jar.get('acorns-access')?.value;
  if (access && authMode() === 'supabase') {
    const response = await supabase('/auth/v1/logout?scope=local', { method: 'POST', headers: { authorization: `Bearer ${access}` } }, true);
    if (!response.ok && response.status !== 401 && response.status !== 403) throw new ApiError(503, 'Odhlásenie je dočasne nedostupné. Skúste znova.');
  }
  await clearTokens();
}

export async function requirePerson() {
  const jar = await cookies();
  if (authMode() === 'profiles') {
    const personId = jar.get('acorns-profile')?.value;
    if (personId !== 'person-1' && personId !== 'person-2') throw new ApiError(401, 'Vyberte svoju líštičku.');
    return personId;
  }
  let token = jar.get('acorns-access')?.value;
  let response = token ? await supabase('/auth/v1/user', { headers: { authorization: `Bearer ${token}` } }, true) : null;
  if (!response || response.status === 401 || response.status === 403) {
    const refresh = jar.get('acorns-refresh')?.value;
    if (!refresh) throw new ApiError(401, 'Prihláste sa do svojho účtu.');
    const renewed = await supabase('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: refresh }),
    }, true);
    if (!renewed.ok) {
      if (renewed.status >= 500) throw new ApiError(503, 'Prihlásenie je dočasne nedostupné.');
      await clearTokens(); throw new ApiError(401, 'Prihlásenie vypršalo. Prihláste sa znova.');
    }
    const tokens = await renewed.json() as Tokens;
    await saveTokens(tokens); token = tokens.access_token;
    response = await supabase('/auth/v1/user', { headers: { authorization: `Bearer ${token}` } }, true);
  }
  if (!response.ok) throw new ApiError(response.status >= 500 ? 503 : 401, 'Účet sa nepodarilo overiť.');
  const user = await response.json() as { id: string };
  const membership = await supabase(`/rest/v1/app_members?user_id=eq.${encodeURIComponent(user.id)}&select=person_id`);
  if (!membership.ok) throw new ApiError(503, 'Chýba databázová migrácia alebo priradenie účtu.');
  const rows = await membership.json() as { person_id: string }[];
  const personId = rows[0]?.person_id;
  if (personId !== 'person-1' && personId !== 'person-2') throw new ApiError(403, 'Tento účet nemá prístup k tabuli. Správca musí priradiť účet k Rini alebo Fluffymu.');
  return personId;
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? new URL(request.url).host;
  let parsed: URL | null = null;
  try { parsed = origin ? new URL(origin) : null; } catch { /* Rejected below. */ }
  // Next can canonicalize request.url to localhost behind a proxy; Host remains
  // the browser's destination. Browsers cannot forge the Host/Origin pair.
  if (!parsed || parsed.host !== host || !['http:', 'https:'].includes(parsed.protocol)) throw new ApiError(403, 'Neplatný pôvod požiadavky.');
}

export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof ApiError ? error.message : 'Požiadavku sa nepodarilo spracovať.' },
    { status: error instanceof ApiError ? error.status : 500, headers: { 'cache-control': 'no-store' } });
}
