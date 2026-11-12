create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email varchar(255));
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000001','admin@example.com'),
 ('00000000-0000-0000-0000-000000000002','ed@example.com'),
 ('00000000-0000-0000-0000-000000000003','view@example.com');
