-- =====================================================================
--  RIFAS COLOMBIA · Migración 004 · Bot de WhatsApp (WhatsApp Web en tu PC)
--  La página deja los mensajes en "whatsapp_outbox" y el bot los envía.
--  Ejecutar DESPUÉS de 003. Re-ejecutable.
-- =====================================================================

create table if not exists public.whatsapp_outbox (
  id             bigint generated always as identity primary key,
  kind           text not null check (kind in ('purchase_buyer', 'purchase_owner', 'payment_reminder', 'draw_reminder', 'manual')),
  phone          text not null,
  body           text not null,
  status         text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts       int not null default 0,
  error          text,
  raffle_id      uuid references public.raffles (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
create index if not exists whatsapp_outbox_queue_idx on public.whatsapp_outbox (status, created_at);
create index if not exists whatsapp_outbox_dedupe_idx on public.whatsapp_outbox (raffle_id, kind, phone, created_at);

-- Estado del bot (una fila). El bot la actualiza cada 30 s.
create table if not exists public.bot_status (
  id         int primary key default 1 check (id = 1),
  state      text not null default 'offline',   -- offline | qr | ready | disconnected
  last_seen  timestamptz,
  phone      text,
  info       text
);
insert into public.bot_status (id) values (1) on conflict (id) do nothing;

alter table public.whatsapp_outbox enable row level security;
alter table public.bot_status      enable row level security;

drop policy if exists outbox_admin_read on public.whatsapp_outbox;
create policy outbox_admin_read on public.whatsapp_outbox for select to authenticated using (public.is_admin());
drop policy if exists outbox_admin_update on public.whatsapp_outbox;
create policy outbox_admin_update on public.whatsapp_outbox for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists bot_status_admin_read on public.bot_status;
create policy bot_status_admin_read on public.bot_status for select to authenticated using (public.is_admin());
