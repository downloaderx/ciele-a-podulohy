import { ApiError, authMode, checkOrigin, clearTokens, errorResponse, requirePerson, saveTokens, selectProfile, signOut, supabase } from '../../server-storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mode = authMode();
    try { return Response.json({ mode, personId: await requirePerson() }, { headers: { 'cache-control': 'no-store' } }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) return Response.json({ mode, personId: null }, { headers: { 'cache-control': 'no-store' } });
      throw error;
    }
  }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (Number(request.headers.get('content-length')) > 8192) throw new ApiError(413, 'Požiadavka je príliš veľká.');
    const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown; personId?: unknown } | null;
    if (authMode() === 'profiles') {
      const personId = await selectProfile(body?.personId);
      return Response.json({ personId }, { headers: { 'cache-control': 'no-store' } });
    }
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 320 || body.password.length > 1024) {
      throw new ApiError(400, 'Zadajte e-mail a heslo.');
    }
    const response = await supabase('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: body.email.trim(), password: body.password }),
    }, true);
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
      response.status === 429 ? 'Príliš veľa pokusov. Skúste to neskôr.' : 'Prihlásenie sa nepodarilo. Skontrolujte e-mail a heslo.');
    await saveTokens(await response.json());
    try { return Response.json({ personId: await requirePerson() }, { headers: { 'cache-control': 'no-store' } }); }
    catch (error) { await clearTokens(); throw error; }
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await signOut();
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
