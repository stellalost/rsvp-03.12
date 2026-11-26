create table if not exists invites (
  id bigint generated always as identity primary key,
  parent_id bigint references invites(id),
  name text not null,
  email text not null,
  phone text,
  status text not null default 'invited' check (status in ('invited','confirmed','revoked')),
  level int not null default 1,
  quota int not null default 3,
  child_quota int not null default 3,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table invites add column if not exists child_quota int not null default 3;

create unique index if not exists invites_email_active on invites (lower(email)) where status <> 'revoked';
create index if not exists invites_parent on invites (parent_id);

-- no policies = nobody can read or write from the browser. only the server (service key) can.
alter table invites enable row level security;

create or replace function add_guests(p_token_hash text, p_guests jsonb)
returns setof invites language plpgsql as $$
declare me invites; used int; n int; total int;
begin
  perform pg_advisory_xact_lock(1400);
  select * into me from invites where token_hash = p_token_hash and status <> 'revoked' for update;
  if not found then raise exception 'this link is not valid or has been cancelled.'; end if;
  if me.status <> 'confirmed' then raise exception 'confirm your details first.'; end if;
  if me.level >= 3 then raise exception 'you can''t add guests.'; end if;
  n := jsonb_array_length(p_guests);
  select count(*) into used from invites where parent_id = me.id and status <> 'revoked';
  if used + n > me.quota then raise exception 'that is more guests than you have left.'; end if;
  select count(*) into total from invites where status <> 'revoked';
  if total + n > 1400 then raise exception 'the guest list is full.'; end if;
  return query
    insert into invites (parent_id, name, email, level, quota, child_quota, token_hash)
    select me.id, g->>'name', lower(g->>'email'), me.level + 1, me.child_quota, 0, g->>'token_hash'
    from jsonb_array_elements(p_guests) g
    returning *;
end $$;

create or replace function seed_invites(p_rows jsonb)
returns setof invites language plpgsql as $$
declare n int; total int;
begin
  perform pg_advisory_xact_lock(1400);
  n := jsonb_array_length(p_rows);
  select count(*) into total from invites where status <> 'revoked';
  if total + n > 1400 then raise exception 'that would go over the capacity of 1400.'; end if;
  return query
    insert into invites (name, email, level, quota, child_quota, token_hash)
    select r->>'name', lower(r->>'email'), 1, coalesce((r->>'quota')::int, 3), coalesce((r->>'child_quota')::int, 3), r->>'token_hash'
    from jsonb_array_elements(p_rows) r
    on conflict (lower(email)) where status <> 'revoked' do nothing
    returning *;
end $$;

create or replace function revoke_branch(p_id bigint)
returns void language sql as $$
  with recursive t as (
    select id from invites where id = p_id
    union all
    select i.id from invites i join t on i.parent_id = t.id
  )
  update invites set status = 'revoked' where id in (select id from t);
$$;

revoke execute on function add_guests(text, jsonb) from public, anon, authenticated;
revoke execute on function seed_invites(jsonb) from public, anon, authenticated;
revoke execute on function revoke_branch(bigint) from public, anon, authenticated;
