-- Access-rule checks. On a plain Postgres 15+: run local_stub.sql (fakes the Supabase
-- roles and auth schema, plus the three test accounts), then the migration,
-- then seed.sql, then this file. Each block says what to expect.
\set ON_ERROR_STOP off
\echo == anon reads (expect 2 recipes)
set role anon; select count(*) from plico.recipes;
\echo == anon insert (expect permission denied)
insert into plico.sections(name) values ('x');
\echo == anon bootstrap (expect denied)
select plico.bootstrap_admin('view@example.com');
reset role;
\echo == viewer
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; set role authenticated;
select (plico.ensure_profile()).role;
\echo viewer insert recipe (expect RLS violation)
insert into plico.recipes(id,title,section_id) values ('v','V',1);
\echo viewer self-promote attempts (expect denied x3)
update plico.profiles set role='admin';
select plico.set_role('00000000-0000-0000-0000-000000000003','admin');
select plico.bootstrap_admin('view@example.com');
select * from plico.list_members();
\echo viewer update/delete recipes (expect 0 rows)
update plico.recipes set title='hack'; delete from plico.recipes;
reset role;
\echo == bootstrap admin via postgres
select plico.bootstrap_admin('ADMIN@example.com');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set role authenticated;
select plico.my_role();
select plico.set_display_name('Chef Admin');
select plico.set_role('00000000-0000-0000-0000-000000000003','editor');
select email, role from plico.list_members();
\echo demote last admin (expect error)
select plico.set_role('00000000-0000-0000-0000-000000000001','viewer');
insert into plico.sections(name,sort) values ('Drinks',60) returning id;
update plico.settings set public_read=false, site_name='Test';
\echo admin tries to set updated_at column directly (expect denied)
update plico.settings set id=2;
\echo admin insert: created_by is forced to the caller (expect ...0001), blank credit defaults to display name
insert into plico.recipes(id,title,section_id,created_by,contributor) values ('admin-dish','A',1,'00000000-0000-0000-0000-000000000003','  ') returning created_by, contributor;
reset role;
\echo == now-editor
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; set role authenticated;
insert into plico.recipes(id,title,section_id) values ('ed-dish','E',1) returning created_by, contributor;
\echo editor update: slug and created_by frozen, credit editable (expect ed-dish, ...0003, From Nana)
update plico.recipes set id='renamed', created_by=null, contributor='From Nana', title='E2' where id='ed-dish' returning id, created_by, contributor, title;
\echo editor manage sections/settings (expect RLS fail / 0 rows)
insert into plico.sections(name) values ('nope');
update plico.settings set site_name='hacked'; select site_name from plico.settings;
\echo editor sees only own profile (expect 1)
select count(*) from plico.profiles;
reset role;
\echo == anon with public_read=false (expect 0, 0)
set request.jwt.claim.sub=''; set role anon; select count(*) from plico.recipes; select count(*) from plico.sections; select site_name from plico.settings;
reset role;
\echo == bad data (expect check violations)
insert into plico.recipes(id,title,section_id) values ('Bad Slug','x',1);
insert into plico.recipes(id,title,section_id,steps) values ('ok','x',1,'{}');
\echo == favorites
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; set role authenticated;
insert into plico.favorites(recipe_id) values ('weeknight-chili') returning user_id, recipe_id;
\echo favorite for someone else (expect RLS violation)
insert into plico.favorites(user_id, recipe_id) values ('00000000-0000-0000-0000-000000000001','weeknight-chili');
\echo favorite a recipe that does not exist (expect foreign key violation)
insert into plico.favorites(recipe_id) values ('no-such-recipe');
reset role;
\echo another user sees none of them, and cannot remove them (expect 0, then 1 left)
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set role authenticated;
select count(*) from plico.favorites; delete from plico.favorites;
reset role; select count(*) from plico.favorites;
\echo signed out (expect permission denied)
set request.jwt.claim.sub=''; set role anon; select count(*) from plico.favorites;
reset role;
