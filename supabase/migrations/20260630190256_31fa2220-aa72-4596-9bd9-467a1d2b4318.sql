create table public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  customer_email text,
  customer_name text,
  amount_total bigint not null default 0,
  currency text not null default 'usd',
  status text not null default 'paid',
  environment text not null default 'sandbox',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.orders to service_role;

alter table public.orders enable row level security;

create policy "Service role manages orders"
  on public.orders for all
  to service_role
  using (true) with check (true);
