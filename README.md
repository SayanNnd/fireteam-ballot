# Fireteam Ballot

A real-time voting app for Destiny 2 fireteams. Create a room, invite up to five other Guardians, rank the raid destinations, and let the ballots choose where to go.

## How it works

1. A fireteam leader creates a room and shares its four-letter code.
2. Players join with a display name and can verify a Bungie Name.
3. Each player ranks the raid options and may veto one raid.
4. When everyone locks a ballot, the highest-scoring eligible raid wins. Ties are resolved at random.

The app keeps each room's pick history. Its two most recent raid picks receive a standings penalty; the penalty does not affect winner selection.

## Project layout

```text
frontend/                 Vite app: pages, components, styles and browser services
backend/                  Server-side Bungie request handlers
api/                      Vercel Function entrypoints (kept at repository root)
shared/                   Raid data and Bungie helpers used across runtimes
database/schema.sql       Supabase tables, policies and Realtime setup
docs/                     Local development, testing and deployment guides
```

Vercel expects serverless function entrypoints in a root-level `api/` directory. Those small entrypoints delegate to `backend/`. See [AGENTS.md](AGENTS.md) for architecture and contribution guidance.

## Stack

- React, TypeScript, Vite and CSS for the frontend
- Supabase Postgres and Realtime for rooms, ballots and history
- Vercel Functions for Bungie API requests
- Vercel for hosting

## Get started

Requirements: Node.js, npm and a Supabase project.

```sh
npm install
```

Create `.env.local` from the template and fill in your project values:

```powershell
Copy-Item .env.example .env.local
```

Run the SQL in [`database/schema.sql`](database/schema.sql) from the Supabase SQL Editor. The policies are open to anonymous clients for this friends-only app, so do not store sensitive information in rooms.

Then start the frontend:

```sh
npm run dev
```

For the complete local setup, including the Vercel API functions, see [docs/development.md](docs/development.md). For the testing checklist, see [docs/testing.md](docs/testing.md).

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Public anon key; access is controlled by Supabase policies |
| `VITE_BUNGIE_API_KEY` | Local Vite proxy only | Used by `npm run dev`; never add it to Vercel |
| `BUNGIE_API_KEY` | Backend functions | Server-side Bungie key; keep it secret |
| `VITE_BUNGIE_LOCAL_MODE` | Local development | `proxy` for Vite, `functions` to use `vercel dev` |

## Available commands

```sh
npm run dev       # Start the Vite frontend
npm run build     # Type-check and build the production frontend
npm run preview   # Preview the static production build
npm run lint      # Lint the project
npm test          # Run unit tests
```

## Deploy

Import the repository into Vercel with the **repository root** as the project root. Use the Vite preset and set the Vercel environment variables listed in [docs/deployment-vercel.md](docs/deployment-vercel.md). Vercel serves the frontend build from `dist/` and deploys the functions in root `api/`.
