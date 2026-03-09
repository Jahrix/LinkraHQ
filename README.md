# Linkra by Jahrix

Supabase-backed lock-in dashboard with a premium dark-only UI. The React app owns canonical user state; the localhost server is limited to local tooling, Git helpers, AI planning, and OS integrations.

## v0.2.4 Highlights
- GitHub Commits connect/reconnect now uses the Supabase identity flow only; the legacy `/auth/github/start` route is intentionally disabled.
- Local Git scanning is unified on the current `/api/local-git/*` routes so Settings, Dashboard, and New Project read the same detected repo data.
- Build My Plan now returns a real Anthropic-generated plan or a clear failure message instead of silently falling back.
- Daily Goals runtime state is normalized on load/save so today’s goals render reliably.
- Broken custom dropdown behavior was replaced by one stable shared select pattern.
- Light mode has been removed from the user-facing app; Linkra is dark-only.
- The white grid background keeps the same direction, but with a subtler bloom/glow treatment.

## Prerequisites
- Node.js 18+
- npm 9+

## Setup
```bash
npm install
```

Create the frontend env file manually with your Supabase project values:

```bash
cat <<'EOF' > apps/web/.env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
EOF
```

Required frontend env vars:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Create the server env file for local tooling and AI planning:

```bash
cp apps/server/.env.example apps/server/.env
```

Important server env vars:
- `ANTHROPIC_API_KEY` enables Build My Plan
- `PORT` defaults to `4170`
- `CLIENT_ORIGIN` defaults to `http://localhost:5173`
- `SESSION_SECRET` is recommended for stable local sessions
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required for Supabase-backed AI quota/admin checks

## Supabase Quota/Admin Setup
- Run the SQL migration in `supabase/migrations/20260309_ai_plan_admin_quota.sql`
- This creates:
  - `user_roles`
  - `ai_plan_quotas`
  - `admin_invite_codes`
  - RPC functions for quota checks and admin code claims
- To seed an admin invite code in Supabase SQL:

```sql
insert into public.admin_invite_codes (label, code_hash, uses_remaining)
values (
  'Jahrix admin',
  encode(digest('YOUR_SECRET_CODE_HERE', 'sha256'), 'hex'),
  1
);
```

## GitHub Setup
- Linkra v0.2.4 uses **Supabase GitHub auth/linking** for the Commits flow.
- Do **not** use or bookmark `/auth/github/start`; that route now returns `410 Gone` on purpose.
- Enable GitHub as an auth provider in your Supabase project if you want GitHub sign-in/linking.
- If you want to connect GitHub to an existing account, Supabase manual identity linking must be enabled in **Auth → Configuration → Advanced Settings**.
- Existing `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` placeholders in `apps/server/.env.example` are legacy leftovers and are not the active Commits auth path in v0.2.4.

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

## Core Flows

### Commits
- Open **Commits** and use **Connect GitHub**.
- Connected, disconnected, and reconnect-needed states are handled in-app through Supabase.
- If GitHub is already linked, Linkra should not send you into an `identity_already_exists` redirect loop.
- If you need to unlink GitHub, make sure another sign-in method exists first; Supabase blocks unlinking the only remaining identity.

### Local Git
- Open **Settings → Local Git**.
- Add one or more watch directories that contain Git repositories or parent folders of repositories.
- Click **Scan Now**.
- Detected repos are written into the same app state used by:
  - Settings
  - Dashboard Local Git
  - New Project → Local Repo selector
- If a scan completes with no matches, the app should show a clear empty state instead of a blank/broken panel.

### Build My Plan
- Build My Plan calls the local server at `/api/ai/build-plan`.
- It requires `ANTHROPIC_API_KEY` in `apps/server/.env`.
- The current flow returns either:
  - a real plan with task IDs and rationale
  - a direct error explaining why generation failed

### Daily Goals
- Daily Goals are sourced from the Supabase-backed app state.
- On load/save, Linkra normalizes daily state so the current day entry exists and renders cleanly.

### Theme
- Linkra is dark-only in v0.2.4.
- There is no supported light mode or appearance toggle in the user-facing app.

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
- **Commits tries to open `/auth/github/start`**: you are running a stale build. Rebuild/restart the app and reconnect from Commits.
- **GitHub linking says manual linking is disabled**: enable manual identity linking in Supabase Auth advanced settings before linking GitHub to an existing account.
- **GitHub unlink fails**: GitHub is probably your only sign-in method. Add email/password or another provider first, then disconnect it.
- **Port already in use**: change `PORT` in `apps/server/.env` and restart.
- **Build My Plan is unavailable**: add `ANTHROPIC_API_KEY` to `apps/server/.env` and restart the server.
- **Build My Plan returns an error**: confirm there are open tasks to plan from and that the Anthropic key is valid.
- **Git scan finds zero repos**: check Settings → Local Git, confirm the watch folder path is valid, and scan a folder that contains detectable `.git` repositories.
- **Git scan or Dashboard Local Git looks empty**: rescan from Settings and confirm the scan completed successfully; Settings, Dashboard, and New Project now read the same repo list.
- **Daily Goals do not load**: verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly and that the web app can reach your Supabase project.
- **App fails at startup**: verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly in `apps/web/.env`.
