# Supabase integration

Plico has no server of its own. The app is static files; Supabase
provides the database, the accounts, and the API between them. Every access
rule is enforced inside the database, so the browser code is never trusted.

This guide covers setup, keys, the data model, who can do what, accounts, and
day-to-day operations.

## 1. Setup

You need a Supabase project. A new free project works, and so does one you
already use for something else: everything here lives in its own `plico`
schema and nothing in `public` or `auth` is created or changed.

1. **Run the migration.** Either:
   - Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or
   - open the SQL editor in the dashboard and paste in
     `supabase/migrations/20261110000000_plico_schema.sql`.
2. **Optional: load sample data.** Run `supabase/seed.sql` the same way to get
   five sections and two recipes.
3. **Expose the schema to the API.** In the dashboard's Data API settings, add
   `plico` to *Exposed schemas*. Until you do, every request fails with
   "The schema must be one of the following: public, ...".
   For local development the same setting is in `supabase/config.toml`:

   ```toml
   [api]
   schemas = ["public", "plico"]
   ```
4. **Give the app its connection details.** On a deployed site, edit
   `config.json`, which sits next to `index.html`. It is read when the page
   loads, so no rebuild is needed:

   ```json
   {
     "supabaseUrl": "https://<project-ref>.supabase.co",
     "supabaseKey": "<publishable key>"
   }
   ```

   When developing, you can instead copy `.env.example` to `.env`:

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_KEY=<publishable key>
   ```

   A filled-in `config.json` wins over `.env`.
5. **Create the first admin.** Sign up in the app, then run once in the SQL
   editor:

   ```sql
   select plico.bootstrap_admin('you@example.com');
   ```

   From then on, roles are managed from the app's admin screen.

The client is created once, in `src/lib/supabase.ts`, and pointed at the schema:

```ts
createClient(url, key, { db: { schema: 'plico' } })
```

## 2. Keys

| Key | Where it goes | Why |
|---|---|---|
| Publishable key (older projects: `anon` key) | In the app's `config.json` or `.env`, visible to every visitor | It only identifies the project. Row-level security decides what each request may do. |
| Secret key (older projects: `service_role` key) | Nowhere in this app. Never in the repo, `config.json`, `.env`, or the browser. | It bypasses every access rule. Only use it from your own machine for imports or backups. |

`.env` is in `.gitignore`. If a secret key is ever committed, rotate it in the
dashboard; removing the commit is not enough.

## 3. Data model

Four tables, all in the `plico` schema.

**`settings`**: one row. `site_name`, `tagline`, and `public_read` (true =
anyone can read recipes; false = signed-in accounts only).

**`sections`**: `id`, `name`, `sort`. The headings recipes are filed under.
A section cannot be deleted while recipes still use it.

**`profiles`**: one row per account that has opened the app. `user_id`
(points at Supabase's `auth.users`), `display_name`, `role`. Emails are not
stored here; they stay in `auth.users`.

**`recipes`**:

| Column | Type | Notes |
|---|---|---|
| `id` | text | URL slug such as `weeknight-chili`. Permanent once created. |
| `title` | text | 1 to 200 characters |
| `section_id` | bigint | Points at `sections.id` |
| `serves` | integer | Optional, 1 to 100. Used for scaling. |
| `time` | text | Free text, e.g. "About 45 min" |
| `description` | text | Optional |
| `ingredients` | jsonb | Groups of items, see below |
| `steps` | jsonb | Ordered steps, see below |
| `notes` | jsonb | Array of strings |
| `tags` | text[] | Optional labels |
| `source_url` | text | Optional link to where the recipe came from |
| `added` | date | Defaults to today |
| `created_by` | uuid | Set by the database to the signed-in user |
| `contributor` | text | Credit line shown under the title. Left blank, it becomes "Contributed by" plus the adder's display name. |
| `updated_at` | timestamptz | Set by the database on every change |

```jsonc
// ingredients: one or more groups. Use an empty name for a single ungrouped list.
[
  { "name": "Chili", "items": [
      { "qty": 1.5, "unit": "lb", "item": "ground beef" },
      { "qty": null, "unit": "", "item": "salt, to taste" }   // qty null = not scaled
  ]}
]

// steps: seconds is the timer length, 0 for none.
[
  { "title": "Simmer", "text": "Simmer uncovered, stirring now and then.", "seconds": 1800 }
]
```

## 4. Who can do what

| | Signed out | Viewer | Editor | Admin |
|---|---|---|---|---|
| Read site name and tagline | yes | yes | yes | yes |
| Read recipes and sections | if `public_read` | yes | yes | yes |
| Add, edit, delete recipes | no | no | yes | yes |
| Add, rename, delete sections | no | no | no | yes |
| Change site settings | no | no | no | yes |
| See the member list and change roles | no | no | no | yes |

How it is enforced:

- **Row-level security** is on for every table. Each line above is a policy in
  the migration file, and the policies call `plico.is_editor()`,
  `plico.is_admin()` and `plico.can_read()`.
- **Roles cannot be self-assigned.** No client has write access to `profiles`.
  The only way a role changes is `plico.set_role(user, role)`, which checks
  that the caller is an admin and refuses to remove the last admin.
- **The creator cannot be faked.** A trigger sets `created_by` to the
  signed-in user on insert and freezes it, and the slug, on update. The
  `contributor` credit line is ordinary editable text.
- **`bootstrap_admin` is not reachable from the API.** It only runs from the
  SQL editor or with the secret key.

`supabase/tests/access_rules.sql` exercises each of these as each role.

## 5. Accounts

Sign-up, sign-in, password reset and email confirmation are Supabase Auth,
called from the app with `supabase.auth.signUp`, `signInWithPassword` and so
on. Plico adds only the role on top.

**What happens on sign-in.** The app calls:

```ts
const { data: profile } = await supabase.rpc('ensure_profile')
// profile.role is 'viewer' | 'editor' | 'admin'
```

This creates the person's profile as a viewer the first time and returns it.
The app uses the role to decide which buttons to show; the database enforces
it regardless.

**Functions the app calls** (`supabase.rpc(name, args)`):

| Function | Who | Does |
|---|---|---|
| `ensure_profile()` | any signed-in user | Creates and returns the caller's profile |
| `set_display_name(p_name)` | any signed-in user | Sets the name used in the default credit line on recipes they add |
| `list_members()` | admin | Everyone who has opened the app, with email and role |
| `set_role(p_user, p_role)` | admin | Makes someone a viewer, editor or admin |

**Choosing who can join.** This is set in the dashboard's Auth settings, not
in Plico:

- *Open*: leave sign-ups enabled. Anyone can make an account, but they are
  only a viewer until an admin promotes them.
- *Invite only*: disable new sign-ups and invite people from the dashboard's
  Users page.
- *Private recipe box*: invite only, plus `public_read = false` so recipes are
  hidden from signed-out visitors.

Also in Auth settings: set the **Site URL** and **Redirect URLs** to wherever
the app is hosted, or confirmation and password-reset links will point at the
wrong place. The built-in email sender is rate-limited and meant for testing;
connect your own SMTP provider before inviting more than a handful of people.

**Removing someone.** Demote them with `set_role`, or delete the user in the
dashboard, which removes their profile. Their recipes stay, with the
contributor name they had.

## 6. Operations

**Backups.** Free projects have no downloadable backups. Export on a schedule:

```sh
supabase db dump --schema plico --data-only -f plico-backup.sql
```

The app's export button (recipes as JSON) is the non-technical equivalent.

**Paused projects.** Free projects pause after a period of inactivity and need
a manual restore from the dashboard. The app caches the last recipes it
loaded so it stays readable in the meantime; editing needs the project
running.

**Local development.**

```sh
supabase start        # local Postgres, Auth and API in Docker
supabase db reset     # re-applies migrations and seed.sql
```

Point `.env` at the URL and key that `supabase start` prints.

`supabase/tests/` holds access-rule checks that run on plain Postgres with no
Supabase at all; the header of `access_rules.sql` says how.

**Changing the schema.** Never edit an existing migration. Add a new file with
`supabase migration new <name>`, so installs that already ran the old ones can
upgrade.

**Uninstalling.** `drop schema plico cascade;` removes everything this
project created. Accounts in `auth.users` are left alone.
