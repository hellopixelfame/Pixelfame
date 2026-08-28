-- PIXELFAME wall schema: claims, overlap-safe reservations, live stats,
-- a public-safe view, and storage for uploaded squares.

create extension if not exists pgcrypto;

-- ============================================================
-- claims: one row per purchase (a size x size block anchored at x,y)
-- ============================================================
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  x smallint not null check (x >= 0 and x < 2000),
  y smallint not null check (y >= 0 and y < 1000),
  size smallint not null check (size >= 1 and size <= 10),
  x2 smallint generated always as (x + size - 1) stored,
  y2 smallint generated always as (y + size - 1) stored,
  image_path text,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paise integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  -- two claims' footprints can never overlap while either is pending or paid
  constraint claims_no_overlap exclude using gist (
    int4range(x, x + size) with &&,
    int4range(y, y + size) with &&
  ) where (status in ('pending', 'paid'))
);

create index claims_paid_bbox_idx on public.claims (x, x2, y, y2) where status = 'paid';
create index claims_user_idx on public.claims (user_id);

alter table public.claims enable row level security;

-- No SELECT policy on purpose: claims (email, payment ids) are never read
-- directly by clients. Reads go through the wall_claims view below; writes
-- go through edge functions using the service-role key, except attaching
-- the uploaded image path, which the owner may do themselves pre-payment.
create policy "owner can attach image while pending"
  on public.claims for update
  to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

grant select, update on public.claims to authenticated;

create or replace function public.expire_stale_claims()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.claims
  set status = 'expired'
  where status = 'pending' and expires_at < now();
end;
$$;

-- ============================================================
-- wall_stats: O(1) ticker for "claimed / 20,00,000"
-- ============================================================
create table public.wall_stats (
  id smallint primary key default 1,
  claimed_pixels bigint not null default 0,
  constraint wall_stats_single_row check (id = 1)
);
insert into public.wall_stats (id, claimed_pixels) values (1, 0);

alter table public.wall_stats enable row level security;
create policy "anyone can read wall stats"
  on public.wall_stats for select
  to anon, authenticated
  using (true);

alter publication supabase_realtime add table public.wall_stats;

create or replace function public.handle_claim_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.wall_stats set claimed_pixels = claimed_pixels + (new.size * new.size) where id = 1;
  end if;
  return new;
end;
$$;

create trigger claims_paid_stats
  after update of status on public.claims
  for each row execute function public.handle_claim_paid();

-- ============================================================
-- wall_claims: the only claims data exposed to clients — paid squares,
-- no email / payment / user_id. Runs as the view owner, so it can read
-- claims despite claims having no client-facing SELECT policy.
-- ============================================================
create view public.wall_claims as
select id, x, y, size, x2, y2, image_path, paid_at
from public.claims
where status = 'paid';

grant select on public.wall_claims to anon, authenticated;

-- ============================================================
-- storage: uploaded squares, public read, write-your-own-folder-only
-- ============================================================
insert into storage.buckets (id, name, public)
values ('pixel-images', 'pixel-images', true)
on conflict (id) do nothing;

create policy "users upload into their own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pixel-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update their own files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'pixel-images' and (storage.foldername(name))[1] = auth.uid()::text);
