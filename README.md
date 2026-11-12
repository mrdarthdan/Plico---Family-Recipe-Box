# Plico – Family Recipe Box

A self-hosted recipe box for a family or household: a static web app backed by
your own Supabase project. One recipe box per install.

- Recipes with grouped ingredients, timed steps, notes, tags, a credit line and a source link
- Serving scaler, tick-off ingredients, step timers, full-screen cook mode
- Plain-text recipe editor: type ingredients and steps one per line
- Viewer, editor and admin roles, enforced in the database
- Admin page for members, sections, site name and a JSON export
- Public or sign-in-only reading
- Keeps a copy in the browser, so recipes stay readable if the database is down
- Installs into its own `cookbook` database schema, so it can share a Supabase
  project with other apps

Built with TypeScript, React and Vite. There is no server to run.

## Install it (no build tools needed)

1. Set up the database: follow [docs/supabase.md](docs/supabase.md).
2. Download the ready-to-host site from the
   [`build` branch](../../tree/build) (Code → Download ZIP).
3. Edit `config.json` and fill in your Supabase project URL and publishable key.
4. Upload the files to any static host: GitHub Pages, Netlify, Cloudflare
   Pages, your own server. It works from a subfolder.
5. Add the site's address to the redirect URLs in your Supabase Auth settings.

## Develop it

You need [Node.js](https://nodejs.org) (LTS).

```sh
npm install
cp .env.example .env    # then fill in your project URL and publishable key
npm run dev
```

Open the address it prints, normally http://localhost:5173.

| Command | Does |
|---|---|
| `npm run build` | Builds the site into `dist/` |
| `npm test` | Runs the unit tests for the recipe text parser |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run preview` | Serves the built `dist/` folder locally |

Every push to `main` runs the checks and refreshes the `build` branch.

## Layout

```
src/lib/               data access, recipe text parsing, formatting, timers
src/components/        pages: index, recipe, editor, account, admin, cook mode
public/config.json     connection details, read when the page loads
supabase/migrations/   database schema, roles and access rules
supabase/seed.sql      optional sample sections and recipes
supabase/tests/        access-rule checks, runnable on plain Postgres
docs/supabase.md       setup, keys, data model, accounts, operations
```

## License

MIT. See [LICENSE](LICENSE).
