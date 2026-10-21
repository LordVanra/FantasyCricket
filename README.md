# Fantasy Cricket

React frontend + Cloudflare Worker API + D1 (SQLite). The active app no longer
depends on Supabase Auth, Postgres functions or Realtime. This is a fresh database
deployment; no old accounts or records are imported.

## Local development

Use Node 22.13+ (Node 24 recommended for the SQLite regression tests).

```powershell
cd frontend
npm ci
npm run build
cd ../worker
npm ci
npm run db:local
npm run dev
```

Open http://localhost:8787. For React hot reload, also run `npm run dev` in
`frontend`; its `/api` proxy targets port 8787. All accounts and writes in this
mode are local. First member of the default league becomes commissioner.

Run backend regression tests with `cd worker; npm test`.

## First Cloudflare deployment

1. Sign in to a Cloudflare account with `npx wrangler login` from `worker`.
2. Run `npx wrangler d1 create fantasy-cricket`.
3. Replace the all-zero `database_id` in `worker/wrangler.jsonc` with the returned
   database ID. The placeholder deliberately cannot target an existing database.
4. Run `npx wrangler d1 migrations apply fantasy-cricket --remote`.
5. Generate a long random secret and set it using `npx wrangler secret put STATS_SYNC_TOKEN`.
6. Build `frontend` and run `npm run deploy` from `worker`.
7. Open the resulting HTTPS URL, create an account, then create/join your league.
8. For the Capacitor wrapper, replace `server.url` in `capacitor.config.json` with
   that deployed HTTPS URL and run `npx cap sync` before rebuilding Android/iOS.
   The existing Vercel URL is not a deployment of this new API.

Production uses the existing Vercel site at https://fantasycricketgame.vercel.app.
Vercel's root directory is `frontend`; `frontend/vercel.json` forwards `/api/*`
to https://fantasy-cricket.fantasy-cricket-api.workers.dev. This preserves
same-origin, HTTP-only session cookies. The Worker allows that exact Vercel
origin through `APP_ORIGINS`; add exact preview origins before testing a preview
deployment. Do not allow arbitrary origins or trust forwarded-host headers.

Cloudflare account: `449af3a7cdd1c99bfbe97b5893d1648c`.
D1 database: `595063bf-f558-418b-a412-b641a45d4554` (`fantasy-cricket`).
The root-level legacy `vercel.json` is not used with this project's `frontend`
root setting. Keep the Capacitor URL pointing to the existing Vercel site.
For future updates, deploy the Worker from `worker`, then push the frontend to
the GitHub `main` branch to trigger Vercel. The commands above describe setup
for a new installation; do not recreate the existing production database.

## Tournament statistics

Copy `backend/.env.example` to `backend/.env`, configure `FANTASY_API_URL` and
the same `STATS_SYNC_TOKEN` set on the Worker. Never put this secret in the
frontend. To process an existing scrape:

```powershell
cd backend
npm ci
node processPlayers.js data.json stats.json
```

`SKIP_DB_SYNC=true` allows processing without credentials. The processor uploads
the file actually specified as its output. `changeTournament.js <series-url>`
scrapes/processes/uploads without deleting league data. A different tournament
is rejected when leagues already have drafts/fixtures; use a fresh season DB.

For the daily GitHub workflow set repository secrets `FANTASY_API_URL`,
`STATS_SYNC_TOKEN`, and `TOURNAMENT_URL`. Remove obsolete Supabase secrets after
the new deployment is verified. ESPN scraping remains dependent on the source
site and has not been verified against a live tournament in this migration.

## Gameplay and correctness

- Commissioner starts the draft; squads clear and draft state initializes in
  one database update. The server validates every pick and commits ownership
  and turn advancement together. Concurrent clients cannot overwrite a pick.
- Drafts use 22 players per team. Automatic picks require that player's opt-in;
  an open browser drives automatic picks. Polling is every 3 seconds during a
  draft and 15 seconds otherwise, paused in hidden tabs.
- Membership freezes after drafting/fixtures start. Existing members can switch
  back to their leagues; new members cannot alter an ongoing competition.
- Lineups require 11 owned, distinct players including at least 4 batsmen,
  4 bowlers and 2 allrounders. Trades are equal-size exchanges and commit
  atomically; outgoing players are removed from saved lineups.
- Generate fixtures, save valid lineups, then set each round's scoring deadline
  in Fixtures. Deadlines use local input converted to UTC. Choose a time after
  the relevant cricket matches and the statistics upload have completed.
- The commissioner’s open Fixtures screen checks due matches every minute.
  There is no autonomous scoring cron. Once due, team changes are locked until
  scoring. Completed scores and lineup breakdowns are immutable.
- Scoring retains the existing per-player Nth-appearance rules and adds
  fielding-only appearances. An appearance with no recorded statistics scores
  zero; feed completeness cannot be inferred automatically.

## Capacity and costs

This design targets small private leagues: 20 members, 10 fixture rounds,
500 trade records, 1.5 MB league state and a 1.8 MB JSON
request body limit for tournament uploads. League state is stored as
a revisioned JSON aggregate so related game changes fit into a single atomic
D1 update. Larger tournaments need partitioned stats storage; larger leagues
need normalized tables. Limits return explicit errors instead of truncating data.

D1 Free currently includes 5 million rows read/day, 100,000 rows written/day,
and 5 GB total storage. Workers Free has its own request/CPU quotas. Free does
not mean guaranteed uptime: exceeded quotas can stop requests until reset.
Check current terms before deployment:
https://developers.cloudflare.com/d1/platform/pricing/
https://developers.cloudflare.com/workers/platform/limits/

Authentication uses salted PBKDF2-SHA256, random session tokens stored hashed,
HTTP-only cookies, same-origin JSON requests and login rate limiting. Sessions
expire after seven days; changing a password revokes other sessions. Username
accounts have no email delivery/password-reset flow. Admin uploads use a
separate Worker secret. The historical SQL files are retained for reference and
are not run against D1.


## Squad pool and draft chat

The updater loads the selected competition's full squads before match results. Every roster player gets a team, role and zeroed stats even before their first appearance. Zero-match preseasons are accepted; the IPL workflow requires at least ten teams and 120 roster players. Failed requests and updates that remove existing results or teams cannot overwrite the live dataset. Regression tests run in the daily updater.

Draft chat is available on the dashboard before, during and after a draft. Only league members can read or post; the server sets authors, limits messages to 1000 characters and enforces two seconds between posts. The latest 100 messages are retained. Clients refresh every four seconds while visible.

The configured competition remains IPL 2026. As checked on October 21, 2026, no verified IPL 2027 squad source has been configured; CREX's 2027 squad page reports squads not announced. The dashboard labels the actual season. Once the 2027 ESPN series squads are available, set TOURNAMENT_URL to that series and run Update Cricket Stats. A season change is deliberately blocked when existing drafts or fixtures depend on the old season; use a fresh season database in that case. Do not relabel old-season players or scores as 2027.
