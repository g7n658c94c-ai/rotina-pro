-- Rode isso no SQL Editor do Supabase (Project > SQL Editor > New query)

create table if not exists subscribers (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  status text default 'inactive', -- active | inactive | canceled | expired
  plan text default 'mensal',
  kiwify_order_id text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_subscribers_email on subscribers (email);

-- Ativa Row Level Security (RLS) - importante porque o backend usa a service role key,
-- que ignora RLS, então isso só protege caso alguém tente acessar direto do frontend com a anon key
alter table subscribers enable row level security;
