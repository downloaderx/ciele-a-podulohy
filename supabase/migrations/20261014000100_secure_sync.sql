-- Preserves the existing JSON data. Apply before deploying the new application.
alter table public.app_state add column if not exists revision bigint not null default 0;
create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id text not null unique check (person_id in ('person-1', 'person-2'))
);
alter table public.app_members enable row level security;
revoke all on public.app_members from anon, authenticated;
revoke all on public.app_state from anon, authenticated;
grant all on public.app_members, public.app_state to service_role;

-- Only the authenticated application server may invoke this atomic write.
create or replace function public.save_app_state(p_id text, p_expected_revision bigint, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
  insert into public.app_state(id, data, revision) values (p_id, p_data, 1)
    on conflict (id) do nothing;
  if found then
    if p_expected_revision <> 0 then
      raise exception 'Unexpected initial revision';
    end if;
    return jsonb_build_object('ok', true, 'revision', 1);
  end if;
  update public.app_state set data = p_data, revision = revision + 1, updated_at = now()
    where id = p_id and revision = p_expected_revision returning revision into next_revision;
  return jsonb_build_object('ok', next_revision is not null, 'revision', next_revision);
end;
$$;
revoke all on function public.save_app_state(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_app_state(text, bigint, jsonb) to service_role;
