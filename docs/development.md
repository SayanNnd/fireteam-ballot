# Development setup

## Prerequisites

- Node.js and npm
- A Supabase project
- A Bungie API key if you want to use name verification, raid clear counts, or live featured raids
- The Vercel CLI only if you want to run the Vercel functions locally

## Configure Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run [`../database/schema.sql`](../database/schema.sql).
3. Copy the project URL and anon key from the Supabase API settings.

The schema grants broad anonymous access to the app's room data. Treat room contents as public and do not store private information there.

## Configure local environment

Copy `.env.example` to `.env.local` at the repository root:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BUNGIE_API_KEY=your-bungie-api-key
BUNGIE_API_KEY=your-bungie-api-key
VITE_BUNGIE_LOCAL_MODE=proxy
```

`VITE_` values are included in the browser bundle. The Bungie key with that prefix is only for local proxy mode. The non-prefixed `BUNGIE_API_KEY` is read by backend functions and should never be exposed to frontend code.

## Start frontend development

Open a terminal at the repository root and run:

```sh
npm install
npm run dev
```

Vite uses `frontend/` as its app root and reads environment variables from the repository root. It serves the frontend and proxies development Bungie requests. Supabase remains the remote database/realtime service.

## Run the complete local deployment shape

The project does not have a standalone Express server. Vercel runs each function in `api/` and those entrypoints call handler code in `backend/`.

1. Install and authenticate the Vercel CLI (`npx vercel login`).
2. Link this repository with `npx vercel link`.
3. Add the Vercel Development environment values, or provide them in `.env.local`.
4. Start Vercel's local runtime:

```powershell
$env:VITE_BUNGIE_LOCAL_MODE = 'functions'
npx vercel dev
```

Now the frontend's Bungie requests go to local `/api/...` routes, so this mode exercises both frontend and backend. The CLI prints the local URL. Full details and smoke checks are in [testing.md](testing.md).

## Common commands

```sh
npm run build     # Type-check and build the static frontend into dist/
npm run preview   # Serve the built frontend locally; does not run API functions
npm run lint      # Lint source files
npm test          # Run Vitest unit tests
```
