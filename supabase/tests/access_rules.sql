-- Access-rule checks. On a plain Postgres 15+: run local_stub.sql (fakes the Supabase
-- roles and auth schema, plus the three test accounts), then the migration,
-- then seed.sql, then this file. Each block says what to expect.
\set ON_ERROR_STOP off
\echo == anon reads (expect 2 recipes)
set role anon; select count(*) from cookbook.recipes;
\echo == anon insert (expect permission denied)
insert into cookbook.sections(name) values ('x');
\echo == anon bootstrap (expect denied)
select cookbook.bootstrap_admin('view@example.com');
reset role;
\echo == viewer
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; set role authenticated;
select (cookbook.ensure_profile()).role;
\echo viewer insert recipe (expect RLS violation)
insert into cookbook.recipes(id,title,section_id) values ('v','V',1);
\echo viewer self-promote attempts (expect denied x3)
update cookbook.profiles set role='admin';
select cookbook.set_role('00000000-0000-0000-0000-000000000003','admin');
select cookbook.bootstrap_admin('view@example.com');
select * from cookbook.list_members();
\echo viewer update/delete recipes (expect 0 rows)
update cookbook.recipes set title='hack'; delete from cookbook.recipes;
reset role;
\echo == bootstrap admin via postgres
select cookbook.bootstrap_admin('ADMIN@example.com');
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set role authenticated;
select cookbook.my_role();
select cookbook.set_display_name('Chef Admin');
select cookbook.set_role('00000000-0000-0000-0000-000000000003','editor');
select email, role from cookbook.list_members();
\echo demote last admin (expect error)
select cookbook.set_role('00000000-0000-0000-0000-000000000001','viewer');
insert into cookbook.sections(name,sort) values ('Drinks',60) returning id;
update cookbook.settings set public_read=false, site_name='Test';
\echo admin tries to set updated_at column directly (expect denied)
update cookbook.settings set id=2;
\echo admin insert: created_by is forced to the caller (expect ...0001), blank credit defaults to display name
insert into cookbook.recipes(id,title,section_id,created_by,contributor) values ('admin-dish','A',1,'00000000-0000-0000-0000-000000000003','  ') returning created_by, contributor;
reset role;
\echo == now-editor
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; set role authenticated;
insert into cookbook.recipes(id,title,section_id) values ('ed-dish','E',1) returning created_by, contributor;
\echo editor update: slug and created_by frozen, credit editable (expect ed-dish, ...0003, From Nana)
update cookbook.recipes set id='renamed', created_by=null, contributor='From Nana', title='E2' where id='ed-dish' returning id, created_by, contributor, title;
\echo editor manage sections/settings (expect RLS fail / 0 rows)
insert into cookbook.sections(name) values ('nope');
update cookbook.settings set site_name='hacked'; select site_name from cookbook.settings;
\echo editor sees only own profile (expect 1)
select count(*) from cookbook.profiles;
reset role;
\echo == anon with public_read=false (expect 0, 0)
set request.jwt.claim.sub=''; set role anon; select count(*) from cookbook.recipes; select count(*) from cookbook.sections; select site_name from cookbook.settings;
reset role;
\echo == bad data (expect check violations)
insert into cookbook.recipes(id,title,section_id) values ('Bad Slug','x',1);
insert into cookbook.recipes(id,title,section_id,steps) values ('ok','x',1,'{}');
