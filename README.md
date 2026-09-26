# Live Football Scores

A PWA for following live football matches.

## Features

- Live scores that update automatically
- Goal notifications for the matches you follow
- League tables and stats for the Premier League, Bundesliga and Champions League
- Works offline and can be installed on a phone

## Tech

React, Vite and Tailwind for the app. NestJS and PostgreSQL for the server.
Match data comes from [TheSportsDB](https://www.thesportsdb.com).

## Run it

Requires Node.js, pnpm and Docker.

```bash
pnpm install
pnpm --filter @livescore/types build
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm --filter @livescore/api exec drizzle-kit migrate
pnpm dev
```

Open <http://localhost:5173>.
