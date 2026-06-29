create table if not exists tenants (
  id text primary key,
  name text not null,
  mode text not null,
  created_at timestamptz not null
);

create table if not exists realtime_apps (
  app_id text not null,
  tenant_id text not null references tenants(id),
  name text not null,
  org text not null,
  key text not null,
  secret_encrypted text,
  secret_preview text not null,
  cluster text not null,
  host text not null,
  status text not null,
  active_connections integer not null,
  messages_today integer not null,
  created_at timestamptz not null,
  primary key (tenant_id, app_id),
  unique (key)
);

create table if not exists webhook_endpoints (
  id text primary key,
  tenant_id text not null,
  app_id text not null,
  url text not null,
  enabled_events jsonb not null,
  status text not null,
  last_delivery_at timestamptz,
  failure_count integer not null default 0,
  foreign key (tenant_id, app_id) references realtime_apps(tenant_id, app_id)
);

create table if not exists usage_hourly (
  id text primary key,
  tenant_id text not null,
  app_id text not null,
  hour text not null,
  connections integer not null,
  messages integer not null,
  webhook_failures integer not null default 0,
  foreign key (tenant_id, app_id) references realtime_apps(tenant_id, app_id)
);

create table if not exists realtime_events (
  id text primary key,
  tenant_id text not null,
  app_id text not null,
  time timestamptz not null,
  type text not null,
  channel text not null,
  "user" text not null,
  status text not null,
  meta text not null,
  foreign key (tenant_id, app_id) references realtime_apps(tenant_id, app_id)
);

create table if not exists channel_summaries (
  id text primary key,
  tenant_id text not null,
  app_id text not null,
  name text not null,
  type text not null,
  subscriptions integer not null,
  messages_per_second real not null,
  last_activity timestamptz not null,
  foreign key (tenant_id, app_id) references realtime_apps(tenant_id, app_id)
);

create table if not exists api_tokens (
  id text primary key,
  tenant_id text not null references tenants(id),
  name text not null,
  token_hash text not null unique,
  token_preview text not null,
  scopes jsonb not null,
  created_at timestamptz not null,
  last_used_at timestamptz
);

create table if not exists tenant_memberships (
  tenant_id text not null references tenants(id),
  user_id text not null,
  role text not null,
  created_at timestamptz not null,
  primary key (tenant_id, user_id)
);

alter table realtime_apps add column if not exists secret_encrypted text;

create index if not exists realtime_apps_tenant_idx on realtime_apps(tenant_id);
create index if not exists usage_hourly_app_idx on usage_hourly(tenant_id, app_id, hour);
create index if not exists realtime_events_app_time_idx on realtime_events(tenant_id, app_id, time desc);
create index if not exists channel_summaries_app_idx on channel_summaries(tenant_id, app_id);
create index if not exists webhook_endpoints_app_idx on webhook_endpoints(tenant_id, app_id);
create index if not exists tenant_memberships_user_idx on tenant_memberships(user_id);
