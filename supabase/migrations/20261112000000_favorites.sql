-- Favorites: each signed-in person's own short list of recipes.

create table plico.favorites (
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  recipe_id  text not null references plico.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table plico.favorites enable row level security;

-- You can see, add and remove only your own favorites. There is no update
-- policy: a favorite is either there or not.
create policy "favorites: read own"
  on plico.favorites for select to authenticated
  using (user_id = (select auth.uid()));

create policy "favorites: add own"
  on plico.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "favorites: remove own"
  on plico.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on plico.favorites to authenticated;
grant all on plico.favorites to service_role;
