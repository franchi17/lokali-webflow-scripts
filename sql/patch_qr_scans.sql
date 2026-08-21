-- patch_qr_scans.sql — QR-code scan tracking for printed marketing (#flyer)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor (api.golokali.com project).
--
-- WHAT THIS ADDS
--   1. `qr_scans` — one row per QR-code landing. Written anonymously by
--      scripts/lokali-qr-tracker.js when a visitor arrives with
--      ?utm_source=qr (the printed codes encode utm_campaign=flyer etc.,
--      so each print placement gets its own bucket automatically).
--   2. `admin_qr_scans()` — is_admin()-gated stats RPC read by the admin
--      panel on /account (lokali-account.js). Its OWN function on purpose:
--      redefining admin_overview() to add keys is how the exit-survey
--      section went blank in production (2026-08-16).
--
-- PRIVACY: no IP, no user id, no fingerprint — just campaign, landing path,
-- referrer, device class and a timestamp. RLS has no SELECT policy, so the
-- public can write a row but never read any back; only the RPC reads, and
-- only for the admin.
-- ---------------------------------------------------------------------------

create table if not exists public.qr_scans (
  id         bigint generated always as identity primary key,
  campaign   text not null default 'unknown',  -- utm_campaign ('flyer')
  medium     text,                              -- utm_medium ('print')
  landing    text,                              -- path the code landed on ('/')
  referrer   text,
  device     text,                              -- 'mobile' | 'desktop'
  created_at timestamptz not null default now()
);

create index if not exists qr_scans_created_at_idx
  on public.qr_scans (created_at);

alter table public.qr_scans enable row level security;

-- Anonymous insert only (the tracker fires before anyone signs in), with
-- length caps so a hostile client can't stuff megabytes into a text column.
drop policy if exists qr_scans_insert_public on public.qr_scans;
create policy qr_scans_insert_public on public.qr_scans
  for insert to anon, authenticated
  with check (
        char_length(coalesce(campaign, '')) <= 60
    and char_length(coalesce(medium,   '')) <= 60
    and char_length(coalesce(landing,  '')) <= 200
    and char_length(coalesce(referrer, '')) <= 300
    and char_length(coalesce(device,   '')) <= 20
  );
-- No SELECT/UPDATE/DELETE policies: rows are write-only from the browser.

grant insert on public.qr_scans to anon, authenticated;

-- ── admin stats ────────────────────────────────────────────────────────────
create or replace function public.admin_qr_scans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     bigint;
  v_today     bigint;
  v_7d        bigint;
  v_30d       bigint;
  v_campaigns jsonb;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select count(*) into v_total from qr_scans;
  select count(*) into v_today from qr_scans where created_at >= date_trunc('day', now());
  select count(*) into v_7d    from qr_scans where created_at >= now() - interval '7 days';
  select count(*) into v_30d   from qr_scans where created_at >= now() - interval '30 days';

  select coalesce(jsonb_agg(jsonb_build_object(
           'campaign',  s.campaign,
           'total',     s.n,
           'last_30d',  s.n30,
           'last_scan', s.last_scan
         ) order by s.n desc), '[]'::jsonb)
    into v_campaigns
    from (
      select campaign,
             count(*)                                                    as n,
             count(*) filter (where created_at >= now() - interval '30 days') as n30,
             max(created_at)                                             as last_scan
        from qr_scans
       group by campaign
    ) s;

  return jsonb_build_object(
    'ok', true,
    'total', v_total, 'today', v_today, 'last_7d', v_7d, 'last_30d', v_30d,
    'campaigns', v_campaigns
  );
end;
$$;

revoke all on function public.admin_qr_scans() from public;
grant execute on function public.admin_qr_scans() to authenticated;
