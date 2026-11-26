-- =====================================================================
--  RIFAS COLOMBIA · Migración v2
--  · Compra SIN registro (nombre, cédula y celular)
--  · Registro de mensajes de WhatsApp y recordatorios
--  · Contenido del sitio (logo, marca, video "cómo participar")
--  · Multimedia: banners del inicio, galería/video del premio, banners laterales
--
--  Ejecutar DESPUÉS de schema.sql, en: Supabase → SQL Editor → New query → Run
--  Es re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Comprador invitado
-- ---------------------------------------------------------------------
alter table public.transactions add column if not exists buyer_national_id text;
create index if not exists transactions_buyer_lookup_idx
  on public.transactions (buyer_national_id, buyer_phone);

-- ---------------------------------------------------------------------
-- 2. Límite de intentos (anti-abuso) — usado por el servidor
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limits_key_idx on public.rate_limits (key, created_at);
alter table public.rate_limits enable row level security;   -- sin políticas: solo service_role

-- Devuelve true si se permite la acción (y la registra), false si superó el límite
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_minutes int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.rate_limits where created_at < now() - interval '1 day';
  select count(*) into v_count from public.rate_limits
   where key = p_key and created_at > now() - make_interval(mins => p_window_minutes);
  if v_count >= p_max then return false; end if;
  insert into public.rate_limits (key) values (p_key);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 3. Crear orden de invitado (SOLO el servidor con service_role)
-- ---------------------------------------------------------------------
create or replace function public.create_guest_order(
  p_raffle_id         uuid,
  p_numbers           int[],
  p_method            public.pay_method,
  p_plan              public.pay_plan,
  p_amount_declared   numeric,
  p_receipt_path      text,
  p_buyer_name        text,
  p_buyer_national_id text,
  p_buyer_phone       text
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_raffle    public.raffles;
  v_numbers   int[];
  v_count     int;
  v_available int;
  v_total     numeric;
  v_declared  numeric;
  v_minutes   int;
  v_name      text := trim(regexp_replace(coalesce(p_buyer_name, ''), '\s+', ' ', 'g'));
  v_id        text := upper(regexp_replace(coalesce(p_buyer_national_id, ''), '[^0-9A-Za-z]', '', 'g'));
  v_phone     text := regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g');
  v_tx        public.transactions;
begin
  if length(v_phone) = 12 and v_phone like '57%' then v_phone := substr(v_phone, 3); end if;
  if length(v_name) < 5 or v_name !~ '\s' then raise exception 'INVALID_BUYER_NAME'; end if;
  if v_id !~ '^[0-9A-Z]{5,15}$' then raise exception 'INVALID_BUYER_ID'; end if;
  if v_phone !~ '^3[0-9]{9}$' then raise exception 'INVALID_BUYER_PHONE'; end if;

  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found or v_raffle.status <> 'published' then raise exception 'RAFFLE_NOT_AVAILABLE'; end if;
  if v_raffle.draw_date is not null and v_raffle.draw_date <= now() then raise exception 'RAFFLE_CLOSED'; end if;

  select coalesce(array_agg(distinct n order by n), '{}') into v_numbers
    from unnest(p_numbers) n where n is not null;
  v_count := coalesce(array_length(v_numbers, 1), 0);
  if v_count = 0 then raise exception 'NO_NUMBERS'; end if;
  if v_count > v_raffle.max_numbers_per_order then raise exception 'TOO_MANY_NUMBERS'; end if;

  if p_method <> 'cash' and p_receipt_path is null then raise exception 'RECEIPT_REQUIRED'; end if;
  if p_receipt_path is not null and p_receipt_path not like 'guest/%' then raise exception 'INVALID_RECEIPT'; end if;

  -- Anti-acaparamiento: máx. 3 reservas pendientes por celular o cédula en la misma rifa
  if (select count(*) from public.transactions
       where raffle_id = p_raffle_id and status = 'pending'
         and (buyer_phone = v_phone or buyer_national_id = v_id)) >= 3 then
    raise exception 'TOO_MANY_PENDING';
  end if;

  perform public.release_expired_holds();

  perform 1 from public.tickets
    where raffle_id = p_raffle_id and number = any (v_numbers)
    order by number
    for update;

  select count(*) into v_available from public.tickets
   where raffle_id = p_raffle_id and number = any (v_numbers) and status = 'available';
  if v_available <> v_count then raise exception 'NUMBERS_TAKEN'; end if;

  v_total := v_raffle.ticket_price * v_count;
  if p_plan = 'partial' then
    v_declared := coalesce(p_amount_declared, 0);
    if v_declared <= 0 or v_declared >= v_total then raise exception 'INVALID_PARTIAL_AMOUNT'; end if;
    if v_declared < ceil(v_total * v_raffle.min_partial_percent / 100.0) then raise exception 'PARTIAL_TOO_LOW'; end if;
  else
    v_declared := v_total;
  end if;

  v_minutes := case when p_receipt_path is not null then v_raffle.verification_minutes else v_raffle.hold_minutes end;

  insert into public.transactions (
    raffle_id, user_id, numbers, method, plan, amount_total, amount_declared,
    receipt_path, status, expires_at, buyer_name, buyer_national_id, buyer_phone
  ) values (
    p_raffle_id, null, v_numbers, p_method, p_plan, v_total, v_declared,
    p_receipt_path, 'pending', now() + make_interval(mins => v_minutes),
    v_name, v_id, v_phone
  ) returning * into v_tx;

  update public.tickets
     set status = 'pending', transaction_id = v_tx.id, held_until = v_tx.expires_at, updated_at = now()
   where raffle_id = p_raffle_id and number = any (v_numbers);

  return v_tx;
end $$;

-- ---------------------------------------------------------------------
-- 4. Venta manual con cédula (reemplaza la versión v1)
-- ---------------------------------------------------------------------
drop function if exists public.admin_manual_sale(uuid, int[], text, text, text, numeric, public.pay_method, text);

create or replace function public.admin_manual_sale(
  p_raffle_id         uuid,
  p_numbers           int[],
  p_buyer_name        text,
  p_buyer_phone       text default null,
  p_buyer_national_id text default null,
  p_buyer_email       text default null,
  p_amount_paid       numeric default null,     -- null = pago completo
  p_method            public.pay_method default 'cash',
  p_note              text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_raffle  public.raffles;
  v_numbers int[];
  v_count   int;
  v_total   numeric;
  v_paid    numeric;
  v_phone   text := nullif(regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g'), '');
  v_id      text := nullif(upper(regexp_replace(coalesce(p_buyer_national_id, ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_tx      public.transactions;
begin
  perform public.assert_admin();
  if coalesce(trim(p_buyer_name), '') = '' then raise exception 'BUYER_REQUIRED'; end if;
  if v_phone is not null and length(v_phone) = 12 and v_phone like '57%' then v_phone := substr(v_phone, 3); end if;

  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found or v_raffle.status = 'finished' then raise exception 'RAFFLE_NOT_AVAILABLE'; end if;

  select coalesce(array_agg(distinct n order by n), '{}') into v_numbers from unnest(p_numbers) n where n is not null;
  v_count := coalesce(array_length(v_numbers, 1), 0);
  if v_count = 0 then raise exception 'NO_NUMBERS'; end if;

  perform public.release_expired_holds();
  perform 1 from public.tickets where raffle_id = p_raffle_id and number = any (v_numbers) order by number for update;
  if (select count(*) from public.tickets
       where raffle_id = p_raffle_id and number = any (v_numbers) and status = 'available') <> v_count then
    raise exception 'NUMBERS_TAKEN';
  end if;

  v_total := v_raffle.ticket_price * v_count;
  v_paid  := least(coalesce(p_amount_paid, v_total), v_total);
  if v_paid < 0 then raise exception 'INVALID_AMOUNT'; end if;

  insert into public.transactions (
    raffle_id, user_id, numbers, method, plan, amount_total, amount_declared, amount_paid,
    status, buyer_name, buyer_phone, buyer_national_id, buyer_email, is_manual, admin_note, reviewed_by, reviewed_at
  ) values (
    p_raffle_id, null, v_numbers, p_method,
    case when v_paid >= v_total then 'full'::public.pay_plan else 'partial'::public.pay_plan end,
    v_total, v_paid, v_paid,
    case when v_paid >= v_total then 'approved'::public.tx_status else 'partial'::public.tx_status end,
    trim(p_buyer_name), v_phone, v_id, nullif(trim(coalesce(p_buyer_email, '')), ''), true, p_note, auth.uid(), now()
  ) returning * into v_tx;

  if v_paid > 0 then
    insert into public.transaction_payments (transaction_id, amount, method, note, created_by)
    values (v_tx.id, v_paid, p_method, coalesce(p_note, 'Venta manual'), auth.uid());
  end if;

  update public.tickets
     set status = case when v_tx.status = 'approved' then 'paid'::public.ticket_status else 'partial'::public.ticket_status end,
         transaction_id = v_tx.id, held_until = null, updated_at = now()
   where raffle_id = p_raffle_id and number = any (v_numbers);
  return v_tx;
end $$;

-- ---------------------------------------------------------------------
-- 5. Contenido del sitio (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  id              int primary key default 1 check (id = 1),
  brand_name      text not null default 'RifaYa',
  tagline         text,
  logo_url        text,
  howto_title     text not null default '¿Cómo participar?',
  howto_video_url text,              -- enlace de YouTube
  owner_whatsapp  text,              -- celular del organizador (recibe avisos de compra)
  updated_at      timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. Multimedia (banners, galería del premio, videos)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.media_kind as enum ('image', 'video', 'youtube');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_placement as enum ('home_banner', 'gallery', 'side_left', 'side_right');
exception when duplicate_object then null; end $$;

create table if not exists public.media_items (
  id         uuid primary key default gen_random_uuid(),
  raffle_id  uuid references public.raffles (id) on delete cascade,
  placement  public.media_placement not null,
  kind       public.media_kind not null,
  url        text not null,
  link_url   text,
  caption    text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  -- Los banners del inicio son globales; el resto pertenece a una rifa
  constraint media_scope check ((placement = 'home_banner') = (raffle_id is null))
);
create index if not exists media_items_raffle_idx on public.media_items (raffle_id, placement, sort_order);

-- ---------------------------------------------------------------------
-- 7. Registro de mensajes de WhatsApp
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id             bigint generated always as identity primary key,
  raffle_id      uuid references public.raffles (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  kind           text not null check (kind in ('purchase_buyer', 'purchase_owner', 'payment_reminder', 'draw_reminder')),
  phone          text,
  status         text not null check (status in ('sent', 'failed', 'manual')),
  provider_id    text,
  error          text,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_lookup_idx on public.notifications (raffle_id, kind, phone, created_at);

-- ---------------------------------------------------------------------
-- 8. RLS de tablas nuevas
-- ---------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.media_items   enable row level security;
alter table public.notifications enable row level security;

drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists settings_admin_update on public.site_settings;
create policy settings_admin_update on public.site_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists media_read on public.media_items;
create policy media_read on public.media_items for select to anon, authenticated
  using (
    public.is_admin()
    or (is_active and (raffle_id is null
        or exists (select 1 from public.raffles r where r.id = raffle_id and r.status <> 'draft')))
  );
drop policy if exists media_admin_insert on public.media_items;
create policy media_admin_insert on public.media_items for insert to authenticated with check (public.is_admin());
drop policy if exists media_admin_update on public.media_items;
create policy media_admin_update on public.media_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists media_admin_delete on public.media_items;
create policy media_admin_delete on public.media_items for delete to authenticated using (public.is_admin());

drop policy if exists notifications_admin_read on public.notifications;
create policy notifications_admin_read on public.notifications for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 9. Permisos de funciones
-- ---------------------------------------------------------------------
revoke execute on function public.create_guest_order(uuid, int[], public.pay_method, public.pay_plan, numeric, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.create_guest_order(uuid, int[], public.pay_method, public.pay_plan, numeric, text, text, text, text) to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

revoke execute on function public.admin_manual_sale(uuid, int[], text, text, text, text, numeric, public.pay_method, text) from public, anon;
grant execute on function public.admin_manual_sale(uuid, int[], text, text, text, text, numeric, public.pay_method, text) to authenticated;

-- La compra con cuenta de v1 ya no se usa desde la app
revoke execute on function public.create_order(uuid, int[], public.pay_method, public.pay_plan, numeric, text) from authenticated;

-- ---------------------------------------------------------------------
-- 10. Storage: permitir videos del premio (hasta 50 MB, límite del plan gratis)
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
 where id = 'raffle-images';
