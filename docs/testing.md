# Local testing guide

This project has a frontend build and serverless API functions. The folder layout separates their source; it does not mean you start two Node servers in two folders.

## Choose a local mode

### Frontend development with Vite

From the repository root:

```sh
npm install
npm run dev
```

Vite serves the app (usually at `http://localhost:5173`). In this mode Bungie requests use Vite's development proxy and `VITE_BUNGIE_API_KEY`. The Vercel functions under `api/` are not started by this command. Supabase is still the configured remote project.

### Run the frontend and Vercel functions together

Install or invoke the Vercel CLI, log in, and link this folder to a Vercel project once:

```sh
npx vercel login
npx vercel link
```

Add the Development environment variables in Vercel, or put the local values in `.env.local`. Keep both Bungie variables there when needed: `VITE_BUNGIE_API_KEY` for Vite proxy mode and `BUNGIE_API_KEY` for the server functions.

In PowerShell, run:

```powershell
$env:VITE_BUNGIE_LOCAL_MODE = 'functions'
npx vercel dev
```

Open the URL printed by the CLI (commonly `http://localhost:3000`). The Vercel dev server builds the frontend and runs the `api/` functions locally. The mode setting tells the browser app to call those local `/api/...` routes instead of the Vite-to-Bungie proxy.

Close that terminal when finished. To switch back to plain Vite in the same PowerShell window, clear the override:

```powershell
Remove-Item Env:VITE_BUNGIE_LOCAL_MODE
npm run dev
```

## What the folders do

```text
Browser -> frontend/ (Vite during development, static files in production)
       -> Supabase (database and realtime)
       -> /api/... -> api/ route adapter -> backend/ handler -> Bungie API
```

`frontend/` contains browser code. `backend/` contains server-side request handling. `api/` contains the tiny Vercel route files that connect URLs such as `/api/bungie-raid-stats` to those handlers. Vercel requires those route files at the repository root. `shared/` contains code both sides can use.

`npm run preview` only serves the static production build. Use `npx vercel dev` when you need to exercise the API functions locally.

## Smoke test the app

1. Confirm `.env.local` contains the Supabase URL and anon key, and that you ran `database/schema.sql` in Supabase.
2. Open the app in two separate browser profiles or tabs.
3. Create a room in one tab and join it from the other with the four-letter code.
4. Confirm player updates appear in both tabs without refreshing.
5. Start voting, submit ballots, and confirm the result appears after every player locks in.
6. In function mode, check that the Bungie routes respond from the same local origin:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/bungie-milestones'
```

To test Bungie Name verification, substitute a real Bungie Name:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3000/api/bungie-raid-stats' `
  -ContentType 'application/json' `
  -Body '{"name":"Guardian#1234","verifyOnly":true}'
```

Use the actual URL/port printed by Vercel CLI if it differs from `3000`.

## Build and code checks

Run these from the repository root:

```sh
npm run build
npm run lint
npm test
```

The build type-checks both the frontend and server code, then writes static files to `dist/`. Unit tests use Vitest. These commands check code; the two-browser room flow above checks Supabase setup and realtime behavior.
