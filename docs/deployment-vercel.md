# Deploy to Vercel

This is one Vercel project with a Vite frontend and two serverless API routes. Keep the Vercel project root at the repository root so Vercel can find both the frontend build and the root-level `api/` functions.

## Before deploying

1. Create a Supabase project and run [`../database/schema.sql`](../database/schema.sql) in its SQL Editor.
2. Confirm the app builds locally with `npm run build`.
3. Push the repository to GitHub, GitLab or Bitbucket.

## Connect the repository

1. In Vercel, choose **Add New → Project** and import the repository.
2. Keep the **Root Directory** at the repository root (the default).
3. Select the **Vite** framework preset. The build command is `npm run build`; the output directory is `dist`.
4. Add these environment variables for Preview and Production:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `BUNGIE_API_KEY` | Bungie API key (server-side secret) |

Do not add `VITE_BUNGIE_API_KEY` to Vercel. Variables prefixed with `VITE_` are available to browser code. The server handlers read `BUNGIE_API_KEY` without exposing it in the frontend bundle. `VITE_BUNGIE_LOCAL_MODE` is a local switch and is not needed for production.

5. Select **Deploy**. Vercel serves the Vite output from `dist/` and deploys `api/bungie-milestones.ts` and `api/bungie-raid-stats.ts` as function routes.

## Test and publish

Every push to a non-production branch creates a Preview deployment. Test the room flow using two browser sessions and check the Bungie route at `/api/bungie-milestones`. After it works, merge to the configured Production Branch (usually `main`) to update the production URL.

You can also deploy from the CLI after linking the repository:

```sh
npx vercel login
npx vercel link
npx vercel
npx vercel --prod
```

The first `npx vercel` creates a Preview deployment; `npx vercel --prod` deploys to the production domain. Vercel's CLI can also run the functions locally with `npx vercel dev`.

## After deployment

- Open the app on a phone and complete one room with a second browser session.
- Open `/api/bungie-milestones`; it should return Bungie milestone data (or an empty `Response` if `BUNGIE_API_KEY` is missing).
- If Bungie lookups fail, check that `BUNGIE_API_KEY` is set for the right Vercel environment, then redeploy.
- If Supabase fails, check the two `VITE_SUPABASE_*` variables and confirm the database schema was applied.

Further reading: [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite), [Vercel Functions](https://vercel.com/docs/functions), [environment variables](https://vercel.com/docs/environment-variables), and [deploying from the CLI](https://vercel.com/docs/projects/deploy-from-cli).
