# Linkra by Jahrix

Supabase-backed lock-in dashboard with a Liquid Glass UI. The React app owns canonical user state; the localhost server is limited to local tooling, Git/GitHub helpers, and OS integrations.

## v0.2.1 Highlights
- Projects CRUD with emoji picker (create/edit/rename/archive/delete)
- Local Git hardening (dedupe, scan lock, incremental cache, watcher debounce, path safety)
- Insights engine with grouped “Signals → Actions” recommendations
- Today Plan auto-generation + editable list + quick “Start Focus”
- Project Journal (typed entries + links to tasks/roadmap)
- Weekly Review recap + corrected streak / commit rollups + close-week snapshots
- Strict import migration support through schema version `3`

## Prerequisites
- Node.js 18+
- npm 9+

## Setup
```bash
npm install
```

Create the frontend env file with your Supabase project values:

```bash
cp apps/web/.env.example apps/web/.env
```

Required frontend env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## GitHub OAuth Setup
1. Create a GitHub OAuth App.
2. Set the callback URL to `http://localhost:4170/auth/github/callback`.
3. Copy `.env.example` and fill in the values.

```bash
cp apps/server/.env.example apps/server/.env
```

Required env vars:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

## Run (Dev)
```bash
npm run dev
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:4170

## Run (Local Production)
```bash
npm run build
npm run start
```
- App: http://localhost:4170

## Startup Automation
Linkra generates user-level startup files locally (no admin required). In-app Settings → Startup:
- Click **Generate Startup Files**
- Copy the generated files into the appropriate OS startup folder

### macOS (LaunchAgent)
1. Copy `~/.linkra/startup/linkra_macos.plist` to `~/Library/LaunchAgents/`.
2. Run:
```bash
launchctl load -w ~/Library/LaunchAgents/linkra_macos.plist
```
3. Linkra opens on login.

### Windows (Task Scheduler)
1. Open Task Scheduler.
2. Import `~\.linkra\startup\linkra_windows.xml`.
3. Choose **Run only when user is logged on**.

## Data Model
- Canonical user-visible app state lives in Supabase.
- Export/Import/Wipe in Settings operate against that same Supabase-backed state model.
- The localhost server does not persist competing user app state.
- Current schema version: `3`.
- Older exports (`schema_version` 1/2) are auto-migrated on import.
- Daily local backup files are written to `~/.linkra/backups` (default retention 14 days) from the current Supabase-backed state snapshot.

## Import / Merge Modes
- `Replace All`: replace local state with imported data.
- `Merge (Keep Local)`: keep local entities when IDs conflict.
- `Merge (Overwrite)`: overwrite local entities with imported entities when IDs conflict.
- Import preview includes counts and diff summary (added/changed/removed).

## Troubleshooting
- **OAuth callback mismatch**: ensure the GitHub OAuth app uses `http://localhost:4170/auth/github/callback`.
- **Port already in use**: change `PORT` in `apps/server/.env` and restart.
- **GitHub login fails**: verify `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET`.
- **Git scan not running**: check Settings → Local Git and ensure watch dirs exist and Git CLI is installed.
- **App fails at startup**: verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly in `apps/web/.env`.
