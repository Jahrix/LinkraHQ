# Linkra by Jahrix

Local-first lock-in dashboard with a Liquid Glass UI. Runs entirely on localhost with a Node backend + React frontend.

## Prerequisites
- Node.js 18+
- npm 9+

## Setup
```bash
npm install
```

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
- All data stored locally at `~/.linkra/linkra-db.json`.
- Export/Import in Settings uses a single JSON bundle with `schema_version` and `created_at`.
- Daily backups stored at `~/.linkra/backups` (default retention 14 days).

## Troubleshooting
- **OAuth callback mismatch**: ensure the GitHub OAuth app uses `http://localhost:4170/auth/github/callback`.
- **Port already in use**: change `PORT` in `apps/server/.env` and restart.
- **GitHub login fails**: verify `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET`.
- **Git scan not running**: check Settings → Local Git and ensure watch dirs exist and Git CLI is installed.
