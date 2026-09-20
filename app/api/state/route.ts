import { NextRequest, NextResponse } from 'next/server';

type StoredState = {
  activePersonId: unknown;
  activityLog: unknown;
  authRecords: unknown;
  goals: unknown;
  people: unknown;
};

const stateKey = process.env.SUPABASE_APP_STATE_KEY ?? 'main';

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { serviceRoleKey, url };
}

function isStoredState(value: unknown): value is StoredState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Partial<StoredState>;

  return (
    typeof state.activePersonId === 'string' &&
    Array.isArray(state.activityLog) &&
    Boolean(state.authRecords) &&
    typeof state.authRecords === 'object' &&
    Array.isArray(state.goals) &&
    Array.isArray(state.people)
  );
}

function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
}

export async function GET() {
  const config = getSupabaseConfig();

  if (!config) {
    return NextResponse.json(
      { error: 'Supabase storage is not configured.' },
      { status: 503 },
    );
  }

  const response = await fetch(
    `${config.url}/rest/v1/app_state?id=eq.${encodeURIComponent(stateKey)}&select=data`,
    {
      cache: 'no-store',
      headers: supabaseHeaders(config.serviceRoleKey),
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to read app state.' },
      { status: response.status },
    );
  }

  const rows = (await response.json()) as Array<{ data?: unknown }>;

  return NextResponse.json({ data: rows[0]?.data ?? null });
}

export async function PUT(request: NextRequest) {
  const config = getSupabaseConfig();

  if (!config) {
    return NextResponse.json(
      { error: 'Supabase storage is not configured.' },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as unknown;

  if (!isStoredState(payload)) {
    return NextResponse.json({ error: 'Invalid app state.' }, { status: 400 });
  }

  const response = await fetch(
    `${config.url}/rest/v1/app_state?on_conflict=id`,
    {
      body: JSON.stringify({
        data: payload,
        id: stateKey,
        updated_at: new Date().toISOString(),
      }),
      headers: {
        ...supabaseHeaders(config.serviceRoleKey),
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      method: 'POST',
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to save app state.' },
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true });
}
