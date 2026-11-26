-- =====================================================================
--  RIFAS COLOMBIA · Esquema completo para Supabase (PostgreSQL 15+)
--  Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
--  Es idempotente en lo posible; para reiniciar desde cero ver final.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.raffle_status as enum ('draft', 'published', 'paused', 'finished');
exception when duplicate_object then null; end $$;

-- Estado público de cada número en la cuadrícula
--   available = disponible · pending = en verificación (con temporizador)
--   partial   = reservado con abono · paid = vendido/pagado
do $$ begin
  create type public.ticket_status as enum ('available', 'pending', 'partial', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tx_status as enum ('pending', 'partial', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pay_method as enum ('nequi', 'daviplata', 'breb', 'bancolombia', 'cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pay_plan as enum ('full', 'partial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------

-- Correos que reciben rol admin automáticamente al registrarse con Google
create table if not exists public.admin_emails (
  email text primary key
);

-- Perfil público de cada usuario (1:1 con auth.users)
create table if not exists public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  phone           text,                 -- WhatsApp, formato 3XXXXXXXXX o +573XXXXXXXXX
  birth_date      date,
  national_id     text,                 -- Cédula (opcional, para entrega de premios)
  data_consent_at timestamptz,          -- Autorización tratamiento de datos (Ley 1581 de 2012)
  role            public.user_role not null default 'user',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint users_phone_format check (phone is null or phone ~ '^(\+57)?3[0-9]{9}$'),
  constraint users_national_id_format check (national_id is null or national_id ~ '^[0-9A-Za-z\-]{5,15}$')
);

create table if not exists public.raffles (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null,
  description           text,
  prize                 text not null,
  image_url             text,
  ticket_price          numeric(12, 0) not null check (ticket_price > 0),
  total_numbers         int not null check (total_numbers between 10 and 10000),
  draw_date             timestamptz,
  lottery_reference     text,                         -- ej. "Últimas 2 cifras de la Lotería de Boyacá"
  hold_minutes          int not null default 30   check (hold_minutes between 5 and 1440),      -- sin comprobante (efectivo)
  verification_minutes  int not null default 1440 check (verification_minutes between 15 and 10080), -- con comprobante
  min_partial_percent   int not null default 30   check (min_partial_percent between 1 and 99),
  max_numbers_per_order int not null default 20   check (max_numbers_per_order between 1 and 500),
  status                public.raffle_status not null default 'draft',
  winner_number         int,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint raffles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint raffles_winner_range check (winner_number is null or (winner_number >= 0 and winner_number < total_numbers))
);

create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  raffle_id        uuid not null references public.raffles (id) on delete cascade,
  user_id          uuid references public.users (id) on delete set null,
  numbers          int[] not null,
  method           public.pay_method not null,
  plan             public.pay_plan not null default 'full',
  amount_total     numeric(12, 0) not null check (amount_total >= 0),
  amount_declared  numeric(12, 0) not null default 0 check (amount_declared >= 0), -- lo que el usuario dice haber pagado
  amount_paid      numeric(12, 0) not null default 0 check (amount_paid >= 0),     -- lo confirmado por el admin
  receipt_path     text,                                                            -- ruta en bucket "receipts"
  status           public.tx_status not null default 'pending',
  expires_at       timestamptz,
  -- Snapshot del comprador (también sirve para ventas manuales sin cuenta)
  buyer_name       text,
  buyer_email      text,
  buyer_phone      text,
  is_manual        boolean not null default false,
  admin_note       text,
  reviewed_by      uuid references public.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists transactions_raffle_status_idx on public.transactions (raffle_id, status);
create index if not exists transactions_user_idx on public.transactions (user_id);
create index if not exists transactions_expires_idx on public.transactions (expires_at) where status = 'pending';

create table if not exists public.tickets (
  id             bigint generated always as identity primary key,
  raffle_id      uuid not null references public.raffles (id) on delete cascade,
  number         int not null check (number >= 0),
  status         public.ticket_status not null default 'available',
  transaction_id uuid references public.transactions (id) on delete set null,
  held_until     timestamptz,
  updated_at     timestamptz not null default now(),
  unique (raffle_id, number)
);

create index if not exists tickets_raffle_status_idx on public.tickets (raffle_id, status);
create index if not exists tickets_tx_idx on public.tickets (transaction_id);

-- Historial de abonos / pagos confirmados por el admin
create table if not exists public.transaction_payments (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  amount         numeric(12, 0) not null check (amount > 0),
  method         public.pay_method,
  note           text,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists transaction_payments_tx_idx on public.transaction_payments (transaction_id);

-- Cuentas de recaudo que se muestran en el checkout
create table if not exists public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  method         public.pay_method not null,
  label          text not null,              -- ej. "Nequi de Luna"
  account_holder text,
  account_number text,                       -- número, celular o llave Bre-B
  account_type   text,                       -- ej. "Ahorros"
  instructions   text,
  qr_url         text,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Crea el perfil automáticamente al registrarse con Google
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email))
         then 'admin'::public.user_role else 'user'::public.user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Un usuario normal no puede cambiarse el rol ni el correo
create or replace function public.protect_user_columns()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role  := old.role;
    new.email := old.email;
    new.id    := old.id;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Genera / ajusta los números de la rifa al crearla o cambiar el total
create or replace function public.sync_raffle_tickets()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tickets (raffle_id, number)
    select new.id, g from generate_series(0, new.total_numbers - 1) g;
  elsif new.total_numbers > old.total_numbers then
    insert into public.tickets (raffle_id, number)
    select new.id, g from generate_series(old.total_numbers, new.total_numbers - 1) g;
  elsif new.total_numbers < old.total_numbers then
    if exists (select 1 from public.tickets
               where raffle_id = new.id and number >= new.total_numbers and status <> 'available') then
      raise exception 'CANNOT_SHRINK' using hint = 'Hay números vendidos o reservados en el rango que intentas eliminar';
    end if;
    delete from public.tickets where raffle_id = new.id and number >= new.total_numbers;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists users_protect on public.users;
create trigger users_protect
  before update on public.users
  for each row execute function public.protect_user_columns();

drop trigger if exists raffles_touch on public.raffles;
create trigger raffles_touch before update on public.raffles
  for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

drop trigger if exists raffles_sync_tickets on public.raffles;
create trigger raffles_sync_tickets
  after insert or update of total_numbers on public.raffles
  for each row execute function public.sync_raffle_tickets();

-- ---------------------------------------------------------------------
-- 5. LÓGICA DE RESERVAS (RPC)
-- ---------------------------------------------------------------------

-- Libera números cuyas reservas pendientes vencieron. Devuelve # de números liberados.
create or replace function public.release_expired_holds()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.transactions
       set status = 'expired', admin_note = coalesce(admin_note, 'Reserva vencida automáticamente')
     where status = 'pending' and expires_at is not null and expires_at < now()
    returning id
  )
  update public.tickets t
     set status = 'available', transaction_id = null, held_until = null, updated_at = now()
    from expired e
   where t.transaction_id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Crea una orden de 1..N números de forma atómica (sin dobles ventas)
create or replace function public.create_order(
  p_raffle_id       uuid,
  p_numbers         int[],
  p_method          public.pay_method,
  p_plan            public.pay_plan default 'full',
  p_amount_declared numeric default null,
  p_receipt_path    text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_user      public.users;
  v_raffle    public.raffles;
  v_numbers   int[];
  v_count     int;
  v_available int;
  v_total     numeric;
  v_declared  numeric;
  v_minutes   int;
  v_tx        public.transactions;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_user from public.users where id = v_uid;
  if not found or v_user.full_name is null or v_user.phone is null
     or v_user.birth_date is null or v_user.data_consent_at is null then
    raise exception 'PROFILE_INCOMPLETE';
  end if;
  if v_user.birth_date > (current_date - interval '18 years')::date then
    raise exception 'UNDERAGE';
  end if;

  select * into v_raffle from public.raffles where id = p_raffle_id;
  if not found or v_raffle.status <> 'published' then raise exception 'RAFFLE_NOT_AVAILABLE'; end if;
  if v_raffle.draw_date is not null and v_raffle.draw_date <= now() then raise exception 'RAFFLE_CLOSED'; end if;

  select coalesce(array_agg(distinct n order by n), '{}') into v_numbers
    from unnest(p_numbers) n where n is not null;
  v_count := coalesce(array_length(v_numbers, 1), 0);
  if v_count = 0 then raise exception 'NO_NUMBERS'; end if;
  if v_count > v_raffle.max_numbers_per_order then raise exception 'TOO_MANY_NUMBERS'; end if;

  if p_method <> 'cash' and p_receipt_path is null then raise exception 'RECEIPT_REQUIRED'; end if;
  if p_receipt_path is not null and p_receipt_path not like (v_uid::text || '/%') then
    raise exception 'INVALID_RECEIPT';
  end if;

  -- Anti-acaparamiento: máximo 3 órdenes pendientes por usuario y rifa
  if (select count(*) from public.transactions
       where user_id = v_uid and raffle_id = p_raffle_id and status = 'pending') >= 3 then
    raise exception 'TOO_MANY_PENDING';
  end if;

  perform public.release_expired_holds();

  -- Bloqueo de filas: dos personas no pueden tomar el mismo número
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

  v_minutes := case when p_receipt_path is not null then v_raffle.verification_minutes
                    else v_raffle.hold_minutes end;

  insert into public.transactions (
    raffle_id, user_id, numbers, method, plan, amount_total, amount_declared,
    receipt_path, status, expires_at, buyer_name, buyer_email, buyer_phone
  ) values (
    p_raffle_id, v_uid, v_numbers, p_method, p_plan, v_total, v_declared,
    p_receipt_path, 'pending', now() + make_interval(mins => v_minutes),
    v_user.full_name, v_user.email, v_user.phone
  ) returning * into v_tx;

  update public.tickets
     set status = 'pending', transaction_id = v_tx.id, held_until = v_tx.expires_at, updated_at = now()
   where raffle_id = p_raffle_id and number = any (v_numbers);

  return v_tx;
end $$;

-- El usuario puede cancelar su propia orden pendiente (libera los números)
create or replace function public.cancel_my_order(p_tx uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.transactions set status = 'rejected', admin_note = 'Cancelada por el usuario'
   where id = p_tx and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.tickets set status = 'available', transaction_id = null, held_until = null, updated_at = now()
   where transaction_id = p_tx;
end $$;

-- ---------------------------------------------------------------------
-- 6. RPC DE ADMINISTRADOR
-- ---------------------------------------------------------------------

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
end $$;

-- Aprobar pago completo
create or replace function public.admin_approve(p_tx uuid, p_note text default null)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.transactions;
  v_remaining numeric;
begin
  perform public.assert_admin();
  select * into v_tx from public.transactions where id = p_tx for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_tx.status not in ('pending', 'partial') then raise exception 'INVALID_STATE'; end if;

  v_remaining := v_tx.amount_total - v_tx.amount_paid;
  if v_remaining > 0 then
    insert into public.transaction_payments (transaction_id, amount, method, note, created_by)
    values (p_tx, v_remaining, v_tx.method, coalesce(p_note, 'Pago aprobado'), auth.uid());
  end if;

  update public.transactions
     set status = 'approved', amount_paid = amount_total, expires_at = null,
         admin_note = coalesce(p_note, admin_note), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_tx returning * into v_tx;

  update public.tickets set status = 'paid', held_until = null, updated_at = now()
   where transaction_id = p_tx;
  return v_tx;
end $$;

-- Registrar un abono (monto recibido). Si completa el total → pagado.
create or replace function public.admin_register_payment(
  p_tx uuid, p_amount numeric, p_method public.pay_method default null, p_note text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.transactions;
  v_new_paid numeric;
  v_amount numeric;
begin
  perform public.assert_admin();
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_tx from public.transactions where id = p_tx for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_tx.status not in ('pending', 'partial') then raise exception 'INVALID_STATE'; end if;

  v_amount   := least(p_amount, v_tx.amount_total - v_tx.amount_paid);
  v_new_paid := v_tx.amount_paid + v_amount;

  insert into public.transaction_payments (transaction_id, amount, method, note, created_by)
  values (p_tx, v_amount, coalesce(p_method, v_tx.method), p_note, auth.uid());

  update public.transactions
     set amount_paid = v_new_paid,
         status = case when v_new_paid >= amount_total then 'approved'::public.tx_status else 'partial'::public.tx_status end,
         expires_at = null,
         admin_note = coalesce(p_note, admin_note),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_tx returning * into v_tx;

  update public.tickets
     set status = case when v_tx.status = 'approved' then 'paid'::public.ticket_status else 'partial'::public.ticket_status end,
         held_until = null, updated_at = now()
   where transaction_id = p_tx;
  return v_tx;
end $$;

-- Rechazar / liberar números
create or replace function public.admin_reject(p_tx uuid, p_reason text default null)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.transactions;
begin
  perform public.assert_admin();
  update public.transactions
     set status = 'rejected', expires_at = null, admin_note = coalesce(p_reason, 'Rechazado por el administrador'),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_tx and status in ('pending', 'partial')
  returning * into v_tx;
  if not found then raise exception 'INVALID_STATE'; end if;

  update public.tickets set status = 'available', transaction_id = null, held_until = null, updated_at = now()
   where transaction_id = p_tx;
  return v_tx;
end $$;

-- Extender el temporizador de una reserva pendiente
create or replace function public.admin_extend(p_tx uuid, p_minutes int default 30)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.transactions;
begin
  perform public.assert_admin();
  update public.transactions
     set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(mins => greatest(p_minutes, 1))
   where id = p_tx and status = 'pending'
  returning * into v_tx;
  if not found then raise exception 'INVALID_STATE'; end if;
  update public.tickets set held_until = v_tx.expires_at, updated_at = now() where transaction_id = p_tx;
  return v_tx;
end $$;

-- Venta / asignación manual desde el panel (pago presencial directo)
create or replace function public.admin_manual_sale(
  p_raffle_id   uuid,
  p_numbers     int[],
  p_buyer_name  text,
  p_buyer_phone text,
  p_buyer_email text default null,
  p_amount_paid numeric default null,     -- null = pago completo
  p_method      public.pay_method default 'cash',
  p_note        text default null
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
  v_user_id uuid;
  v_tx      public.transactions;
begin
  perform public.assert_admin();
  if coalesce(trim(p_buyer_name), '') = '' then raise exception 'BUYER_REQUIRED'; end if;

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

  -- Si el comprador ya tiene cuenta (mismo correo), se vincula
  if p_buyer_email is not null then
    select id into v_user_id from public.users where lower(email) = lower(p_buyer_email);
  end if;

  insert into public.transactions (
    raffle_id, user_id, numbers, method, plan, amount_total, amount_declared, amount_paid,
    status, buyer_name, buyer_phone, buyer_email, is_manual, admin_note, reviewed_by, reviewed_at
  ) values (
    p_raffle_id, v_user_id, v_numbers, p_method,
    case when v_paid >= v_total then 'full'::public.pay_plan else 'partial'::public.pay_plan end,
    v_total, v_paid, v_paid,
    case when v_paid >= v_total then 'approved'::public.tx_status else 'partial'::public.tx_status end,
    trim(p_buyer_name), p_buyer_phone, p_buyer_email, true, p_note, auth.uid(), now()
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
-- 7. VISTA DE ESTADÍSTICAS
-- ---------------------------------------------------------------------
create or replace view public.raffle_summary
with (security_invoker = true) as
select
  r.*,
  count(t.id) filter (where t.status = 'available' or (t.status = 'pending' and t.held_until < now()))::int as available_count,
  count(t.id) filter (where t.status = 'pending' and (t.held_until is null or t.held_until >= now()))::int as pending_count,
  count(t.id) filter (where t.status = 'partial')::int as partial_count,
  count(t.id) filter (where t.status = 'paid')::int    as paid_count
from public.raffles r
left join public.tickets t on t.raffle_id = r.id
group by r.id;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.admin_emails         enable row level security;  -- sin políticas: solo SQL Editor
alter table public.users                enable row level security;
alter table public.raffles              enable row level security;
alter table public.tickets              enable row level security;
alter table public.transactions         enable row level security;
alter table public.transaction_payments enable row level security;
alter table public.payment_methods      enable row level security;

-- users
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- raffles: público ve todo menos borradores; admin gestiona
drop policy if exists raffles_read on public.raffles;
create policy raffles_read on public.raffles for select to anon, authenticated
  using (status <> 'draft' or public.is_admin());
drop policy if exists raffles_admin_insert on public.raffles;
create policy raffles_admin_insert on public.raffles for insert to authenticated with check (public.is_admin());
drop policy if exists raffles_admin_update on public.raffles;
create policy raffles_admin_update on public.raffles for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists raffles_admin_delete on public.raffles;
create policy raffles_admin_delete on public.raffles for delete to authenticated using (public.is_admin());

-- tickets: lectura pública (sin datos personales). Escritura SOLO vía RPC.
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to anon, authenticated
  using (exists (select 1 from public.raffles r
                  where r.id = raffle_id and (r.status <> 'draft' or public.is_admin())));

-- transactions: cada quien ve las suyas; admin ve todas. Escritura SOLO vía RPC.
drop policy if exists tx_read on public.transactions;
create policy tx_read on public.transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists txp_read on public.transaction_payments;
create policy txp_read on public.transaction_payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.transactions t
                                        where t.id = transaction_id and t.user_id = auth.uid()));

-- payment_methods
drop policy if exists pm_read on public.payment_methods;
create policy pm_read on public.payment_methods for select to anon, authenticated
  using (is_active or public.is_admin());
drop policy if exists pm_admin_insert on public.payment_methods;
create policy pm_admin_insert on public.payment_methods for insert to authenticated with check (public.is_admin());
drop policy if exists pm_admin_update on public.payment_methods;
create policy pm_admin_update on public.payment_methods for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pm_admin_delete on public.payment_methods;
create policy pm_admin_delete on public.payment_methods for delete to authenticated using (public.is_admin());

-- Permisos de ejecución de RPC
revoke execute on function public.create_order(uuid, int[], public.pay_method, public.pay_plan, numeric, text) from public, anon;
revoke execute on function public.cancel_my_order(uuid) from public, anon;
revoke execute on function public.admin_approve(uuid, text) from public, anon;
revoke execute on function public.admin_register_payment(uuid, numeric, public.pay_method, text) from public, anon;
revoke execute on function public.admin_reject(uuid, text) from public, anon;
revoke execute on function public.admin_extend(uuid, int) from public, anon;
revoke execute on function public.admin_manual_sale(uuid, int[], text, text, text, numeric, public.pay_method, text) from public, anon;

grant execute on function public.create_order(uuid, int[], public.pay_method, public.pay_plan, numeric, text) to authenticated;
grant execute on function public.cancel_my_order(uuid) to authenticated;
grant execute on function public.admin_approve(uuid, text) to authenticated;
grant execute on function public.admin_register_payment(uuid, numeric, public.pay_method, text) to authenticated;
grant execute on function public.admin_reject(uuid, text) to authenticated;
grant execute on function public.admin_extend(uuid, int) to authenticated;
grant execute on function public.admin_manual_sale(uuid, int[], text, text, text, numeric, public.pay_method, text) to authenticated;
grant execute on function public.release_expired_holds() to anon, authenticated;  -- idempotente: solo libera vencidas
grant select on public.raffle_summary to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. REALTIME (cuadrícula en vivo + panel admin)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ---------------------------------------------------------------------
-- 10. STORAGE (comprobantes privados + imágenes públicas)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('raffle-images', 'raffle-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Comprobantes: cada usuario sube a su carpeta {user_id}/archivo
drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists receipts_read_own_or_admin on storage.objects;
create policy receipts_read_own_or_admin on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists receipts_admin_delete on storage.objects;
create policy receipts_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- Imágenes de rifas y QR: lectura pública (bucket público), escritura admin
drop policy if exists raffle_images_admin_insert on storage.objects;
create policy raffle_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'raffle-images' and public.is_admin());
drop policy if exists raffle_images_admin_update on storage.objects;
create policy raffle_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'raffle-images' and public.is_admin());
drop policy if exists raffle_images_admin_delete on storage.objects;
create policy raffle_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'raffle-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 11. TEMPORIZADOR AUTOMÁTICO (pg_cron, incluido en el plan gratuito)
--     Si falla: Dashboard → Database → Extensions → habilitar "pg_cron"
--     y vuelve a correr solo este bloque.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

do $$ begin
  perform cron.unschedule('release-expired-holds');
exception when others then null; end $$;

select cron.schedule('release-expired-holds', '* * * * *', $cron$ select public.release_expired_holds(); $cron$);

-- ---------------------------------------------------------------------
-- 12. CONFIGURACIÓN INICIAL — ¡CAMBIA ESTE CORREO POR EL TUYO!
-- ---------------------------------------------------------------------
insert into public.admin_emails (email) values ('tu-correo-admin@gmail.com') on conflict do nothing;

-- Si ya te registraste antes de correr esto:
-- update public.users set role = 'admin' where email = 'tu-correo-admin@gmail.com';

-- =====================================================================
-- REINICIAR (¡borra todo!):
-- drop table if exists public.transaction_payments, public.tickets, public.transactions,
--   public.payment_methods, public.raffles, public.users, public.admin_emails cascade;
-- =====================================================================
