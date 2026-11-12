-- Cookbook: initial schema
--
-- Everything lives in its own `cookbook` schema so the app can be installed
-- into a Supabase project that already hosts other things. Nothing in
-- `public` or `auth` is created or changed.
--
-- One cookbook per install. Roles: viewer < editor < admin.

create schema if not exists cookbook;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Single-row site settings.
create table cookbook.settings (
  id           integer primary key default 1 check (id = 1),
  site_name    text    not null default 'Our Cookbook'
                 check (char_length(site_name) between 1 and 80),
  tagline      text    check (tagline is null or char_length(tagline) <= 200),
  -- true: anyone can read recipes. false: only signed-in accounts can.
  public_read  boolean not null default true,
  updated_at   timestamptz not null default now()
);

insert into cookbook.settings (id) values (1);

-- One row per account that has opened the app. Created by
-- cookbook.ensure_profile(), never written to directly by clients.
create table cookbook.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null
                           or char_length(display_name) between 1 and 60),
  role         text not null default 'viewer'
                 check (role in ('viewer', 'editor', 'admin')),
  created_at   timestamptz not null default now()
);

-- Recipe sections ("Main Dishes", "Desserts", ...). Each install edits these.
create table cookbook.sections (
  id    bigint generated always as identity primary key,
  name  text not null unique check (char_length(name) between 1 and 60),
  sort  integer not null default 0
);

create table cookbook.recipes (
  -- URL slug, e.g. "weeknight-chili"
  id           text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                                       and char_length(id) <= 120),
  title        text not null check (char_length(title) between 1 and 200),
  section_id   bigint not null references cookbook.sections (id)
                 on delete restrict,
  serves       integer check (serves is null or serves between 1 and 100),
  -- Free text shown as-is, e.g. "About 45 min"
  time         text check (time is null or char_length(time) <= 60),
  description  text check (description is null
                           or char_length(description) <= 1000),
  -- [{ "name": "Sauce", "items": [{ "qty": 1.5, "unit": "cup", "item": "stock" }] }]
  ingredients  jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(ingredients) = 'array'),
  -- [{ "title": "Brown the meat", "text": "...", "seconds": 480 }]
  steps        jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(steps) = 'array'),
  -- ["Keeps 3 days in the fridge.", ...]
  notes        jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(notes) = 'array'),
  tags         text[] not null default '{}',
  source_url   text check (source_url is null or source_url ~ '^https?://'),
  added        date not null default current_date,
  created_by   uuid default auth.uid()
                 references auth.users (id) on delete set null,
  -- Credit line shown under the title, e.g. "Contributed by Sam" or
  -- "Adapted from Grandma's card". Defaults to the adder's display name.
  contributor  text check (contributor is null
                           or char_length(contributor) <= 200),
  updated_at   timestamptz not null default now(),
  -- Keep a single recipe to a sane size.
  constraint recipes_size check (
    octet_length(ingredients::text) + octet_length(steps::text)
      + octet_length(notes::text) < 100000
  )
);

create index recipes_section_idx on cookbook.recipes (section_id);
create index recipes_tags_idx    on cookbook.recipes using gin (tags);

-- ---------------------------------------------------------------------------
-- Role helpers
--
-- SECURITY DEFINER so they can read cookbook.profiles regardless of the
-- caller's row-level-security view of it. search_path is emptied and every
-- name is schema-qualified, which is what stops search-path hijacking.
-- ---------------------------------------------------------------------------

-- The caller's role. Signed-out callers and accounts with no profile row yet
-- are treated as viewers.
create function cookbook.my_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role from cookbook.profiles p where p.user_id = auth.uid()),
    'viewer'
  );
$$;

create function cookbook.is_editor()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select cookbook.my_role() in ('editor', 'admin');
$$;

create function cookbook.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select cookbook.my_role() = 'admin';
$$;

-- Whether the caller may read recipes at all.
create function cookbook.can_read()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
      or (select s.public_read from cookbook.settings s where s.id = 1);
$$;

-- ---------------------------------------------------------------------------
-- Account functions (called from the app with supabase.rpc)
-- ---------------------------------------------------------------------------

-- Called by the app right after sign-in. Creates the caller's profile as a
-- viewer if it does not exist, and returns it.
create function cookbook.ensure_profile()
returns cookbook.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_row cookbook.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into cookbook.profiles (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select * into v_row from cookbook.profiles where user_id = auth.uid();
  return v_row;
end;
$$;

-- Lets a signed-in user set the name shown on recipes they add.
create function cookbook.set_display_name(p_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into cookbook.profiles (user_id, display_name)
  values (auth.uid(), nullif(btrim(p_name), ''))
  on conflict (user_id)
  do update set display_name = excluded.display_name;
end;
$$;

-- Admin only: change someone's role. This is the ONLY way a role changes
-- from inside the app; no client can write cookbook.profiles directly.
create function cookbook.set_role(p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not cookbook.is_admin() then
    raise exception 'Only an admin can change roles' using errcode = '42501';
  end if;

  if p_role not in ('viewer', 'editor', 'admin') then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;

  -- Serialise role changes so two admins cannot demote each other at once.
  perform 1 from cookbook.settings where id = 1 for update;

  if p_role <> 'admin'
     and exists (select 1 from cookbook.profiles
                 where user_id = p_user and role = 'admin')
     and (select count(*) from cookbook.profiles where role = 'admin') <= 1
  then
    raise exception 'The cookbook must keep at least one admin'
      using errcode = '42501';
  end if;

  update cookbook.profiles set role = p_role where user_id = p_user;
  if not found then
    raise exception 'That account has not opened the cookbook yet'
      using errcode = 'P0002';
  end if;
end;
$$;

-- Admin only: everyone who has opened the app, with email, for the admin
-- screen. Email comes from auth.users and is never stored in this schema.
create function cookbook.list_members()
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  role         text,
  created_at   timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not cookbook.is_admin() then
    raise exception 'Only an admin can list members' using errcode = '42501';
  end if;

  return query
    select p.user_id, u.email::text, p.display_name, p.role, p.created_at
    from cookbook.profiles p
    join auth.users u on u.id = p.user_id
    order by p.created_at;
end;
$$;

-- Run once from the Supabase SQL editor to create the first admin:
--   select cookbook.bootstrap_admin('you@example.com');
-- Not callable through the API (see the revoke below).
create function cookbook.bootstrap_admin(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if v_user is null then
    raise exception 'No account with email %. Sign up in the app first.',
      p_email;
  end if;

  insert into cookbook.profiles (user_id, role)
  values (v_user, 'admin')
  on conflict (user_id) do update set role = 'admin';
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function cookbook.recipes_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.contributor := nullif(btrim(new.contributor), '');
  if tg_op = 'INSERT' then
    -- Signed-in clients cannot claim someone else's account as the creator.
    -- Imports run from the SQL editor or with the secret key (no auth.uid())
    -- may set created_by freely.
    if auth.uid() is not null then
      new.created_by := auth.uid();
      -- No credit line given: credit the person adding it, if they set a name.
      if new.contributor is null then
        new.contributor := (select 'Contributed by ' || p.display_name
                            from cookbook.profiles p
                            where p.user_id = auth.uid());
      end if;
    end if;
  else
    new.id         := old.id;           -- slugs are permanent
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipes_before_write
  before insert or update on cookbook.recipes
  for each row execute function cookbook.recipes_before_write();

create function cookbook.settings_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch
  before update on cookbook.settings
  for each row execute function cookbook.settings_touch();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table cookbook.settings enable row level security;
alter table cookbook.profiles enable row level security;
alter table cookbook.sections enable row level security;
alter table cookbook.recipes  enable row level security;

-- settings: everyone reads (the app needs the site name before sign-in);
-- admins update. No insert or delete policy: the single row is permanent.
create policy "settings: anyone reads"
  on cookbook.settings for select to anon, authenticated
  using (true);

create policy "settings: admins update"
  on cookbook.settings for update to authenticated
  using ((select cookbook.is_admin()))
  with check ((select cookbook.is_admin()));

-- profiles: you see your own row; admins see all. No write policies at all,
-- so every change goes through the functions above.
create policy "profiles: own row or admin"
  on cookbook.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select cookbook.is_admin()));

-- sections: readable with the recipes; admins manage.
create policy "sections: readers read"
  on cookbook.sections for select to anon, authenticated
  using ((select cookbook.can_read()));

create policy "sections: admins insert"
  on cookbook.sections for insert to authenticated
  with check ((select cookbook.is_admin()));

create policy "sections: admins update"
  on cookbook.sections for update to authenticated
  using ((select cookbook.is_admin()))
  with check ((select cookbook.is_admin()));

create policy "sections: admins delete"
  on cookbook.sections for delete to authenticated
  using ((select cookbook.is_admin()));

-- recipes: readers read; editors and admins write.
create policy "recipes: readers read"
  on cookbook.recipes for select to anon, authenticated
  using ((select cookbook.can_read()));

create policy "recipes: editors insert"
  on cookbook.recipes for insert to authenticated
  with check ((select cookbook.is_editor()));

create policy "recipes: editors update"
  on cookbook.recipes for update to authenticated
  using ((select cookbook.is_editor()))
  with check ((select cookbook.is_editor()));

create policy "recipes: editors delete"
  on cookbook.recipes for delete to authenticated
  using ((select cookbook.is_editor()));

-- ---------------------------------------------------------------------------
-- Grants
--
-- A custom schema gets no API access until it is granted. These are the
-- outer fence (which operations a role may attempt at all); the policies
-- above are the inner fence (which rows).
-- ---------------------------------------------------------------------------

grant usage on schema cookbook to anon, authenticated, service_role;

grant select on cookbook.settings, cookbook.sections, cookbook.recipes
  to anon, authenticated;
grant select on cookbook.profiles to authenticated;
grant update (site_name, tagline, public_read) on cookbook.settings
  to authenticated;
grant insert, update, delete on cookbook.sections, cookbook.recipes
  to authenticated;

grant all on all tables    in schema cookbook to service_role;
grant all on all sequences in schema cookbook to service_role;

-- Functions are executable by PUBLIC by default; lock that down first.
revoke execute on all functions in schema cookbook from public;

grant execute on function
  cookbook.my_role(), cookbook.is_editor(), cookbook.is_admin(),
  cookbook.can_read()
  to anon, authenticated, service_role;

grant execute on function
  cookbook.ensure_profile(), cookbook.set_display_name(text),
  cookbook.set_role(uuid, text), cookbook.list_members()
  to authenticated;

-- bootstrap_admin: SQL editor / service role only.
grant execute on function cookbook.bootstrap_admin(text) to service_role;
