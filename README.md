# Fireteam Ballot

A real-time voting app for Destiny 2 fireteams. Create a room, invite up to five other Guardians, rank the raid destinations, and let the ballots decide where to go.

## How it works

1. The fireteam leader creates a room and shares its four-letter code.
2. Guardians join with their display name. A Bungie Name can be checked against Bungie's API.
3. Each player ranks every raid from 1 to 5 and may veto one raid.
4. Once everyone locks their ballot, the raid with the highest total score is selected. Ties are settled at random.

The app keeps a room's pick history. Its two most recent raid picks receive a penalty in the standings to discourage repetition; this penalty does not change winner selection.

## Features

- Live room, player, ballot, veto, and history updates through Supabase Realtime.
- Rooms for up to six players, with host controls and automatic host handoff when the leader leaves.
- Bungie Name lookup and personal lifetime raid-clear totals when Bungie's public stats are available. Each player sees their own totals on their ballot.
- Weekly featured raid badges from Bungie's milestones API.
- Animated result reveal and post-vote standings.
- A local raid pool in `src/data/raids.ts` that can be edited without changing the voting logic.

## Stack

- **Frontend:** React, TypeScript, Vite, and CSS.
- **Database and realtime:** Supabase Postgres and Realtime.
- **Bungie integration:** Vercel Functions in `api/` keep the production Bungie API key on the server.
- **Hosting:** Vercel.

## Setup

Requirements: Node.js, npm, and a Supabase project.

Clone the project and install its dependencies:

```sh
git clone https://github.com/SayanNnd/fireteam-ballot.git
cd fireteam-ballot
npm install
```

### Supabase

1. Create a Supabase project.
2. Run the full `schema.sql` script in the Supabase SQL Editor. It creates the room, player, vote, veto, and history tables, enables Realtime, and configures the policies used by the app.
3. Copy the Project URL and anon/public key from the Supabase API settings.

The supplied schema allows anonymous clients to access room data and does not add account-based access control. Use it for fireteam coordination without sensitive information.

### Environment variables

Create a `.env.local` file in the project root. The repository includes `.env.example` as a template.

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BUNGIE_API_KEY=your-bungie-api-key
```

`VITE_BUNGIE_API_KEY` is used by the local Vite proxy during development. Bungie lookup and clear counts are unavailable locally if it is not set.

For Vercel, configure these variables for the environments you use:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
BUNGIE_API_KEY
```

Set `BUNGIE_API_KEY` as a Secret. The production API functions read it server-side. The Supabase URL and anon key are used by the browser and therefore retain the `VITE_` prefix. Redeploy after changing Vercel environment variables.

## Development

Start the Vite development server:

```sh
npm run dev
```

Create a production build:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

Run the linter and unit tests:

```sh
npm run lint
npm test
```

## Deployment

Import the GitHub repository into Vercel and use the Vite framework preset. Keep the project root at the repository root, add the environment variables above, and deploy. Vercel serves the static Vite app and deploys the functions in `api/` for Bungie requests.
