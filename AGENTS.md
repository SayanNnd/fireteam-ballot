# Agent guide

## Project overview

Fireteam Ballot is a React + TypeScript single-page app for Destiny 2 fireteams. Supabase stores rooms, players, votes, vetoes and history. Vercel Functions proxy Bungie API requests so the production Bungie key stays server-side.

## Repository layout

- `frontend/`: Vite app root, static assets, React features, browser services and styles.
- `backend/`: server-side request handlers and backend-only helpers.
- `api/`: root-level Vercel Function entrypoints. Keep these thin and delegate implementation to `backend/`; Vercel discovers functions here.
- `shared/`: domain data and helpers imported by frontend and backend code. Keep browser-only APIs and secrets out of this directory.
- `database/schema.sql`: canonical Supabase schema and policy setup.
- `docs/`: development, testing, deployment and planning notes.
- Root config files: npm scripts, TypeScript configs, Vite config and Vercel routing.

Vite's root is `frontend/`, but install, build, test and lint commands run from the repository root. Vite writes production output to root `dist/` so Vercel can serve it alongside `api/` functions.

## Commands

```sh
npm install
npm run dev       # Vite frontend with the Bungie development proxy
npm run build     # Type-check and build frontend and backend source
npm run lint
npm test
npm run preview   # Static frontend only; no Vercel Functions
npx vercel dev    # Local frontend plus Vercel Functions
```

To use local Vercel Functions from the browser, set `VITE_BUNGIE_LOCAL_MODE=functions` before running `npx vercel dev`. Plain Vite uses the local Bungie proxy by default.

## Code organization rules

- Put UI in `frontend/src/features/<feature>/` and reusable UI in `frontend/src/components/`.
- Keep browser integrations in `frontend/src/lib/` and browser-safe domain utilities in `shared/` where both runtimes need them.
- Put backend implementation in `backend/`; route entrypoints belong in root `api/` because that is Vercel's function convention.
- Put the editable raid pool in `shared/data/raids.ts`.
- Put schema changes in `database/schema.sql` and update setup documentation when a manual Supabase step changes.
- Keep frontend API requests same-origin under `/api/...` in production. Do not import server handlers into frontend code.

## Environment and secrets

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are browser-visible configuration.
- `BUNGIE_API_KEY` is server-only. Do not rename it with a `VITE_` prefix or put it in frontend code.
- `VITE_BUNGIE_API_KEY` is for the local Vite proxy only; never configure it in Vercel.
- `.env.local` is untracked. Never commit credentials.

The current Supabase policies allow anonymous access to room records. Preserve that limitation in setup documentation; do not describe room data as private.

## Deployment assumptions

Deploy the repository root as one Vercel project. The frontend build output is `dist/`, Vercel Functions are in root `api/`, and all project environment variables are configured in Vercel. Do not set Vercel's Root Directory to `frontend/` or its functions will be outside the project root.
