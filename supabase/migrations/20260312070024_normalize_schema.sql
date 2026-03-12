-- Create Normalized Schema
-- Replaces single-blob user_state with relational tables based on Zod AppState schema

-- 1. User Settings
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark',
    accent TEXT DEFAULT '#5DD8FF',
    reduce_motion BOOLEAN DEFAULT false,
    start_on_login BOOLEAN DEFAULT false,
    selected_repos JSONB DEFAULT '[]'::jsonb,
    goal_template JSONB DEFAULT '[]'::jsonb,
    repo_watch_dirs JSONB DEFAULT '[]'::jsonb,
    repo_scan_interval_minutes INTEGER DEFAULT 15,
    repo_exclude_patterns JSONB DEFAULT '["**/node_modules/**", "**/.git/**"]'::jsonb,
    git_watcher_enabled BOOLEAN DEFAULT true,
    github_pat TEXT DEFAULT NULL,
    disabled_insight_rules JSONB DEFAULT '[]'::jsonb,
    enable_daily_backup BOOLEAN DEFAULT true,
    backup_retention_days INTEGER DEFAULT 14,
    schema_version INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    icon TEXT DEFAULT '🧩',
    color TEXT DEFAULT '#8b5cf6',
    status TEXT DEFAULT 'Not Started',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    weekly_hours INTEGER DEFAULT 0 CHECK (weekly_hours >= 0),
    logo_url TEXT DEFAULT NULL,
    github_repo TEXT DEFAULT NULL,
    remote_repo TEXT DEFAULT NULL,
    local_repo_path TEXT DEFAULT NULL,
    health_score INTEGER DEFAULT NULL CHECK (health_score >= 0 AND health_score <= 100),
    archived_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_projects_user_id ON projects(user_id);

-- 3. Project Tasks
CREATE TABLE project_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'todo',
    depends_on_ids JSONB DEFAULT '[]'::jsonb,
    priority TEXT DEFAULT 'med',
    due_date TEXT DEFAULT NULL,
    milestone TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    linked_commit JSONB DEFAULT NULL
);

CREATE INDEX idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_user_id ON project_tasks(user_id);

-- 4. Local Repos
CREATE TABLE local_repos (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    watch_dir TEXT DEFAULT NULL,
    remote_url TEXT DEFAULT NULL,
    default_branch TEXT DEFAULT NULL,
    last_commit_at TIMESTAMPTZ DEFAULT NULL,
    last_commit_message TEXT DEFAULT NULL,
    last_commit_author TEXT DEFAULT NULL,
    dirty BOOLEAN DEFAULT false,
    untracked_count INTEGER DEFAULT 0,
    ahead INTEGER DEFAULT 0,
    behind INTEGER DEFAULT 0,
    today_commit_count INTEGER DEFAULT 0,
    last_head_sha TEXT DEFAULT NULL,
    last_status_hash TEXT DEFAULT NULL,
    last_scan_duration_ms INTEGER DEFAULT NULL,
    scan_error TEXT DEFAULT NULL,
    scanned_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_local_repos_user_id ON local_repos(user_id);

-- 5. Daily Goals
CREATE TABLE daily_goals_entries (
    date TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    completed_points INTEGER DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ DEFAULT NULL,
    PRIMARY KEY (user_id, date)
);

CREATE TABLE daily_goals (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_date TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    FOREIGN KEY (user_id, entry_date) REFERENCES daily_goals_entries(user_id, date) ON DELETE CASCADE
);

CREATE INDEX idx_daily_goals_user_id ON daily_goals(user_id);

-- 6. Roadmap Cards
CREATE TABLE roadmap_cards (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lane TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    tags JSONB DEFAULT '[]'::jsonb,
    linked_repo TEXT DEFAULT NULL,
    due_date TEXT DEFAULT NULL,
    project TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_roadmap_cards_user_id ON roadmap_cards(user_id);

-- 7. Session Logs & Focus Sessions
CREATE TABLE session_logs (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL,
    text TEXT NOT NULL,
    project TEXT DEFAULT NULL,
    tags JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_session_logs_user_id ON session_logs(user_id);

CREATE TABLE focus_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    planned BOOLEAN DEFAULT false,
    project_id TEXT DEFAULT NULL,
    reason TEXT DEFAULT NULL
);

CREATE INDEX idx_focus_sessions_user_id ON focus_sessions(user_id);

-- 8. Quick Captures
CREATE TABLE quick_captures (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_quick_captures_user_id ON quick_captures(user_id);

-- 9. Journal Entries
CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id TEXT DEFAULT NULL,
    ts TIMESTAMPTZ NOT NULL,
    type TEXT NOT NULL,
    title TEXT DEFAULT NULL,
    body TEXT NOT NULL,
    links JSONB DEFAULT '{"taskIds": [], "roadmapCardIds": [], "repoIds": [], "commitShas": []}'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);

-- 10. Insights
CREATE TABLE insights (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL,
    severity TEXT NOT NULL,
    project_id TEXT DEFAULT NULL,
    repo_id TEXT DEFAULT NULL,
    rule_id TEXT NOT NULL,
    title TEXT NOT NULL,
    reason TEXT NOT NULL,
    metrics JSONB DEFAULT '{}'::jsonb,
    suggested_actions JSONB DEFAULT '[]'::jsonb,
    dismissed_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_insights_user_id ON insights(user_id);

-- 11. Weekly Reviews & Snapshots
CREATE TABLE weekly_reviews (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    stats JSONB DEFAULT '{}'::jsonb,
    per_project JSONB DEFAULT '[]'::jsonb,
    highlights JSONB DEFAULT '[]'::jsonb,
    markdown TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_weekly_reviews_user_id ON weekly_reviews(user_id);

CREATE TABLE weekly_snapshots (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_weekly_snapshots_user_id ON weekly_snapshots(user_id);

-- 12. Today Plans
CREATE TABLE today_plans (
    date TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_ids JSONB DEFAULT '[]'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL,
    source TEXT DEFAULT 'auto',
    notes TEXT DEFAULT NULL,
    PRIMARY KEY (user_id, date)
);

-- RLS Policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goals_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE today_plans ENABLE ROW LEVEL SECURITY;

-- Helper to create policies for a table
CREATE OR REPLACE FUNCTION create_rls_policy(table_name text) RETURNS void AS $$
BEGIN
    EXECUTE format('CREATE POLICY "Users can only access their own data" ON %I FOR ALL USING (auth.uid() = user_id)', table_name);
END;
$$ LANGUAGE plpgsql;

SELECT create_rls_policy('user_settings');
SELECT create_rls_policy('projects');
SELECT create_rls_policy('project_tasks');
SELECT create_rls_policy('local_repos');
SELECT create_rls_policy('daily_goals_entries');
SELECT create_rls_policy('daily_goals');
SELECT create_rls_policy('roadmap_cards');
SELECT create_rls_policy('session_logs');
SELECT create_rls_policy('focus_sessions');
SELECT create_rls_policy('quick_captures');
SELECT create_rls_policy('journal_entries');
SELECT create_rls_policy('insights');
SELECT create_rls_policy('weekly_reviews');
SELECT create_rls_policy('weekly_snapshots');
SELECT create_rls_policy('today_plans');

DROP FUNCTION create_rls_policy(text);
