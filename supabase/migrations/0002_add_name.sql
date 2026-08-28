-- Adds a display name to claims (e.g. "Alex's square") and exposes it
-- through wall_claims alongside the rest of the public-safe fields.

alter table public.claims add column name text check (char_length(name) <= 60);

create or replace view public.wall_claims as
select id, x, y, size, x2, y2, image_path, paid_at, name
from public.claims
where status = 'paid';

grant select on public.wall_claims to anon, authenticated;

