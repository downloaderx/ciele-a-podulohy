create extension if not exists pgcrypto;

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#35d0ba',
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  parent_id uuid references public.items(id) on delete cascade,
  title text not null,
  description text not null default '',
  is_done boolean not null default false,
  deleted_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_parent_same_board unique (board_id, id)
);

alter table public.items
  add constraint items_parent_board_fk
  foreign key (board_id, parent_id)
  references public.items(board_id, id)
  on delete cascade;

create table public.item_activity (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_boards_updated_at
before update on public.boards
for each row execute function public.touch_updated_at();

create trigger touch_items_updated_at
before update on public.items
for each row execute function public.touch_updated_at();

create or replace view public.item_progress as
with recursive descendants as (
  select
    parent.id as ancestor_id,
    child.id as descendant_id,
    child.is_done
  from public.items parent
  join public.items child on child.parent_id = parent.id

  union all

  select
    descendants.ancestor_id,
    child.id as descendant_id,
    child.is_done
  from descendants
  join public.items child on child.parent_id = descendants.descendant_id
),
tracked as (
  select ancestor_id as item_id, descendant_id, is_done
  from descendants

  union all

  select item.id as item_id, item.id as descendant_id, item.is_done
  from public.items item
  where not exists (
    select 1 from public.items child where child.parent_id = item.id
  )
)
select
  item_id,
  count(*)::integer as total_count,
  count(*) filter (where is_done)::integer as done_count,
  case
    when count(*) = 0 then 0
    else round((count(*) filter (where is_done))::numeric * 100 / count(*))::integer
  end as percent_done
from tracked
group by item_id;

alter table public.boards enable row level security;
alter table public.app_state enable row level security;
alter table public.board_members enable row level security;
alter table public.items enable row level security;
alter table public.item_activity enable row level security;

create policy "Members can read their boards"
on public.boards for select
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = boards.id and member.user_id = auth.uid()
  )
);

create policy "Users can create boards"
on public.boards for insert
with check (created_by = auth.uid());

create policy "Members can update boards"
on public.boards for update
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = boards.id and member.user_id = auth.uid()
  )
);

create policy "Members can read board members"
on public.board_members for select
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = board_members.board_id and member.user_id = auth.uid()
  )
);

create policy "Users can add themselves to boards"
on public.board_members for insert
with check (user_id = auth.uid());

create policy "Members can read items"
on public.items for select
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = items.board_id and member.user_id = auth.uid()
  )
);

create policy "Members can create items"
on public.items for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.board_members member
    where member.board_id = items.board_id and member.user_id = auth.uid()
  )
);

create policy "Members can update items"
on public.items for update
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = items.board_id and member.user_id = auth.uid()
  )
);

create policy "Members can delete items"
on public.items for delete
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = items.board_id and member.user_id = auth.uid()
  )
);

create policy "Members can read activity"
on public.item_activity for select
using (
  exists (
    select 1 from public.board_members member
    where member.board_id = item_activity.board_id and member.user_id = auth.uid()
  )
);

create policy "Members can create activity"
on public.item_activity for insert
with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.board_members member
    where member.board_id = item_activity.board_id and member.user_id = auth.uid()
  )
);
