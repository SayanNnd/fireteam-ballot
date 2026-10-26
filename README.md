# Fireteam Ballot

A realtime web app for Destiny 2 fireteams to resolve "which raid tonight?". Guardians join a room using a 4-letter code, vote privately, each can veto once, and the app reveals a weighted-random pick.

## Stack
- **Frontend**: Vite + React + TypeScript + plain CSS (no Tailwind, no UI libraries)
- **Backend**: Supabase free tier (PostgreSQL + Realtime WebSocket subscriptions)
- **Hosting**: Vercel

## Bungie API

Set `BUNGIE_API_KEY` in Vercel to enable Bungie Name checks and lifetime raid-clear counts in the voting screen. For local development, set `VITE_BUNGIE_API_KEY` in `.env.local`; the Vite proxy uses it for Bungie requests.

---
