# Product notes

This file preserves the original planning notes. Some implementation details and priorities have changed; use the source code and README as the current description of app behavior.

## Current product

- Fireteam rooms with up to six players
- Live lobby, voting and result updates through Supabase Realtime
- Private ballots with one veto per player
- Highest-score selection with a random tie-break
- Recent-pick standings penalty
- Bungie Name verification, clear counts, and weekly featured raid data

## Ideas for later

- Reset a revealed room for another vote while keeping room history
- Account-based player profiles
- Bungie OAuth or fireteam-based room creation
- Per-room raid pools and optional boss-gauntlet modes
