# Linkra ![v2.5.0](https://img.shields.io/badge/version-2.5.0-7c5cfc)

**Momentum-first personal project command center.**

Know what to do next. Reduce confusion. Ship things.

---

## Features

- **Dashboard** — Project cards, task queue, momentum score, AI signals
- **Daily Goals** — Score your day with time-boxed goal tracking
- **Weekly Review** — Streak tracking and weekly progress roll-up
- **Commits** — GitHub activity feed with 52-week heatmap visualization
- **Roadmap** — Kanban lanes (Active / Pipeline / Backlog / Deployed) with card detail panel
- **Tools** — Local Git scanner and system integrations
- **Account Settings** — Profile management with Supabase auth
- **Build My Plan** — AI-generated daily plan via Anthropic Claude
- **Signals / Insights** — Automated project health signals with snooze (24h / 7d / Forever)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js / Express (localhost tooling server) |
| Database | Supabase (Postgres + Auth) |
| AI | Anthropic Claude (Build My Plan) |
| PWA | vite-plugin-pwa (installable, offline-capable) |
| Monorepo | npm workspaces |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A [Supabase](https://supabase.com) project

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the frontend

```bash
cat <<'EOF' > apps/web/.env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
EOF
```

### 3. Configure the server

```bash
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env:
#   ANTHROPIC_API_KEY   — enables Build My Plan
#   PORT                — defaults to 4170
#   CLIENT_ORIGIN       — defaults to http://localhost:5173
#   SESSION_SECRET      — recommended for stable local sessions
#   SUPABASE_URL / SUPABASE_ANON_KEY — AI quota/admin checks
```

### 4. Run (dev)

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4170

### 5. Run (local production)

```bash
npm run build
npm run start
```

- App: http://localhost:4170

---

## Architecture

Linkra is a **same-origin Vite proxy** monorepo:

```
apps/web/     React SPA (Vite, Tailwind)
apps/server/  Express API (localhost only)
packages/shared/  Shared types + utilities
```

In dev, `vite.config.ts` proxies `/api` and `/auth` to `localhost:4170`. In production, the Express server serves the built SPA and handles API routes on the same port.

Canonical app state lives in **Supabase**. The localhost server handles:
- AI planning (Anthropic)
- Local Git scanning
- OS integrations / startup helpers

---

## Supabase Setup

Run migrations in `supabase/migrations/` to set up AI quota and profiles tables.

To grant admin quota to an account:

```sql
insert into public.user_roles (user_id, role, granted_by)
select id, 'admin', id
from auth.users
where email = 'you@example.com'
on conflict (user_id) do update
set role = excluded.role;
```

---

## GitHub / Commits

- Uses **Supabase GitHub identity linking** — not the legacy `/auth/github/start` route.
- Enable GitHub as an auth provider in Supabase Auth settings.
- For linking GitHub to an existing account, enable manual identity linking in **Auth → Configuration → Advanced Settings**.

---

## v2.5.0 Changelog

1. **Profiles table** — Persistent display name/role backed by Supabase; OAuth name auto-populated on signup.
2. **PWA manifest** — Installable via `vite-plugin-pwa`; offline shell caching via Workbox.
3. **Momentum score upgrade** — Count-up animation on change; value-based color scale (red → amber → white → purple glow at 86+).
4. **AI Quota context** — Shared `AiQuotaContext` eliminates per-page quota fetch; header shows live `✦ used/limit` pill.
5. **Signal snooze UI** — 🔕 button on every insight card opens a dropdown: 24h / 7 days / Forever dismiss.
6. **Roadmap card detail panel** — Click any card to open a slide-in panel with editable title, description, tags, due date, linked project, lane, and read-only linked tasks. Auto-saves on blur.
7. **Commit heatmap** — 52-week (desktop) / 16-week (mobile) contribution grid above the commit feed, color-coded by daily commit count.

---

## Troubleshooting

- **Build My Plan unavailable**: add `ANTHROPIC_API_KEY` to `apps/server/.env` and restart.
- **GitHub link fails**: enable manual identity linking in Supabase Auth advanced settings.
- **GitHub unlink blocked**: GitHub is your only sign-in method — add email/password first, then disconnect.
- **Git scan finds zero repos**: verify the watch folder path in Settings → Local Git contains `.git` directories.
- **Daily Goals blank**: check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env`.
- **Port conflict**: change `PORT` in `apps/server/.env` and restart.
