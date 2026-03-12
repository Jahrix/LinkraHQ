-- Data Migration Script
-- Extracts data from user_state.state JSONB and inserts into normalized tables

DO $$
DECLARE
    rec RECORD;
    user_id UUID;
    state JSONB;
BEGIN
    FOR rec IN SELECT id, state FROM user_state LOOP
        user_id := rec.id;
        state := rec.state;

        -- 1. User Settings
        INSERT INTO user_settings (
            user_id, theme, accent, reduce_motion, start_on_login, selected_repos,
            goal_template, repo_watch_dirs, repo_scan_interval_minutes, repo_exclude_patterns,
            git_watcher_enabled, github_pat, disabled_insight_rules, enable_daily_backup, backup_retention_days, schema_version
        ) VALUES (
            user_id,
            state->'userSettings'->>'theme',
            state->'userSettings'->>'accent',
            (state->'userSettings'->>'reduceMotion')::boolean,
            (state->'userSettings'->>'startOnLogin')::boolean,
            COALESCE(state->'userSettings'->'selectedRepos', '[]'::jsonb),
            COALESCE(state->'userSettings'->'goalTemplate', '[]'::jsonb),
            COALESCE(state->'userSettings'->'repoWatchDirs', '[]'::jsonb),
            COALESCE((state->'userSettings'->>'repoScanIntervalMinutes')::integer, 15),
            COALESCE(state->'userSettings'->'repoExcludePatterns', '["**/node_modules/**", "**/.git/**"]'::jsonb),
            COALESCE((state->'userSettings'->>'gitWatcherEnabled')::boolean, true),
            state->'userSettings'->>'githubPat',
            COALESCE(state->'userSettings'->'disabledInsightRules', '[]'::jsonb),
            COALESCE((state->'userSettings'->>'enableDailyBackup')::boolean, true),
            COALESCE((state->'userSettings'->>'backupRetentionDays')::integer, 14),
            COALESCE((state->'userSettings'->>'schemaVersion')::integer, 3)
        ) ON CONFLICT (user_id) DO NOTHING;

        -- 2. Projects
        INSERT INTO projects (
            id, user_id, name, subtitle, icon, color, status, progress, weekly_hours,
            logo_url, github_repo, remote_repo, local_repo_path, health_score, archived_at, created_at, updated_at
        )
        SELECT
            p->>'id', user_id, p->>'name', p->>'subtitle', p->>'icon', p->>'color', p->>'status',
            (p->>'progress')::integer, (p->>'weeklyHours')::integer, p->>'logoUrl', p->>'githubRepo',
            p->>'remoteRepo', p->>'localRepoPath', (p->>'healthScore')::integer,
            (p->>'archivedAt')::timestamptz, (p->>'createdAt')::timestamptz, (p->>'updatedAt')::timestamptz
        FROM jsonb_array_elements(state->'projects') AS p
        ON CONFLICT (id) DO NOTHING;

        -- 3. Project Tasks
        INSERT INTO project_tasks (
            id, project_id, user_id, text, done, status, depends_on_ids, priority,
            due_date, milestone, created_at, completed_at, linked_commit
        )
        SELECT
            t->>'id', p->>'id', user_id, t->>'text', (t->>'done')::boolean, t->>'status',
            COALESCE(t->'dependsOnIds', '[]'::jsonb), t->>'priority', t->>'dueDate', t->>'milestone',
            (t->>'createdAt')::timestamptz, (t->>'completedAt')::timestamptz, t->'linkedCommit'
        FROM jsonb_array_elements(state->'projects') AS p,
             jsonb_array_elements(p->'tasks') AS t
        ON CONFLICT (id) DO NOTHING;

        -- 4. Local Repos
        INSERT INTO local_repos (
            id, user_id, name, path, watch_dir, remote_url, default_branch, last_commit_at,
            last_commit_message, last_commit_author, dirty, untracked_count, ahead, behind,
            today_commit_count, last_head_sha, last_status_hash, last_scan_duration_ms, scan_error, scanned_at
        )
        SELECT
            r->>'id', user_id, r->>'name', r->>'path', r->>'watchDir', r->>'remoteUrl', r->>'defaultBranch',
            (r->>'lastCommitAt')::timestamptz, r->>'lastCommitMessage', r->>'lastCommitAuthor',
            (r->>'dirty')::boolean, (r->>'untrackedCount')::integer, (r->>'ahead')::integer, (r->>'behind')::integer,
            (r->>'todayCommitCount')::integer, r->>'lastHeadSha', r->>'lastStatusHash',
            (r->>'lastScanDurationMs')::integer, r->>'scanError', (r->>'scannedAt')::timestamptz
        FROM jsonb_array_elements(COALESCE(state->'localRepos', '[]'::jsonb)) AS r
        ON CONFLICT (id) DO NOTHING;

        -- 5. Daily Goals Entries & Goals
        INSERT INTO daily_goals_entries (
            date, user_id, score, completed_points, is_closed, archived_at
        )
        SELECT
            entry.key, user_id, (entry.value->>'score')::integer, (entry.value->>'completedPoints')::integer,
            (entry.value->>'isClosed')::boolean, (entry.value->>'archivedAt')::timestamptz
        FROM jsonb_each(state->'dailyGoalsByDate') AS entry
        ON CONFLICT (user_id, date) DO NOTHING;

        INSERT INTO daily_goals (
            id, user_id, entry_date, title, category, points, done, created_at, completed_at
        )
        SELECT
            g->>'id', user_id, entry.key, g->>'title', g->>'category', (g->>'points')::integer,
            (g->>'done')::boolean, (g->>'createdAt')::timestamptz, (g->>'completedAt')::timestamptz
        FROM jsonb_each(state->'dailyGoalsByDate') AS entry,
             jsonb_array_elements(entry.value->'goals') AS g
        ON CONFLICT (id) DO NOTHING;

        -- 6. Roadmap Cards
        INSERT INTO roadmap_cards (
            id, user_id, lane, title, description, tags, linked_repo, due_date, project, created_at, updated_at
        )
        SELECT
            c->>'id', user_id, c->>'lane', c->>'title', c->>'description', COALESCE(c->'tags', '[]'::jsonb),
            c->>'linkedRepo', c->>'dueDate', c->>'project', (c->>'createdAt')::timestamptz, (c->>'updatedAt')::timestamptz
        FROM jsonb_array_elements(state->'roadmapCards') AS c
        ON CONFLICT (id) DO NOTHING;

        -- 7. Session Logs
        INSERT INTO session_logs (
            id, user_id, ts, text, project, tags
        )
        SELECT
            l->>'id', user_id, (l->>'ts')::timestamptz, l->>'text', l->>'project', COALESCE(l->'tags', '[]'::jsonb)
        FROM jsonb_array_elements(state->'sessionLogs') AS l
        ON CONFLICT (id) DO NOTHING;

        -- 8. Focus Sessions
        INSERT INTO focus_sessions (
            id, user_id, started_at, duration_minutes, completed_at, planned, project_id, reason
        )
        SELECT
            fs->>'id', user_id, (fs->>'startedAt')::timestamptz, (fs->>'durationMinutes')::integer,
            (fs->>'completedAt')::timestamptz, (fs->>'planned')::boolean, fs->>'projectId', fs->>'reason'
        FROM jsonb_array_elements(state->'focusSessions') AS fs
        ON CONFLICT (id) DO NOTHING;

        -- 9. Quick Captures
        INSERT INTO quick_captures (
            id, user_id, type, text, created_at
        )
        SELECT
            qc->>'id', user_id, qc->>'type', qc->>'text', (qc->>'createdAt')::timestamptz
        FROM jsonb_array_elements(state->'quickCaptures') AS qc
        ON CONFLICT (id) DO NOTHING;

        -- 10. Journal Entries
        INSERT INTO journal_entries (
            id, user_id, project_id, ts, type, title, body, links, tags, created_at, updated_at
        )
        SELECT
            j->>'id', user_id, j->>'projectId', (j->>'ts')::timestamptz, j->>'type', j->>'title', j->>'body',
            COALESCE(j->'links', '{"taskIds": [], "roadmapCardIds": [], "repoIds": [], "commitShas": []}'::jsonb),
            COALESCE(j->'tags', '[]'::jsonb), (j->>'createdAt')::timestamptz, (j->>'updatedAt')::timestamptz
        FROM jsonb_array_elements(COALESCE(state->'journalEntries', '[]'::jsonb)) AS j
        ON CONFLICT (id) DO NOTHING;

        -- 11. Insights
        INSERT INTO insights (
            id, user_id, ts, severity, project_id, repo_id, rule_id, title, reason, metrics, suggested_actions, dismissed_until, created_at, updated_at
        )
        SELECT
            i->>'id', user_id, (i->>'ts')::timestamptz, i->>'severity', i->>'projectId', i->>'repoId', i->>'ruleId',
            i->>'title', i->>'reason', COALESCE(i->'metrics', '{}'::jsonb), COALESCE(i->'suggestedActions', '[]'::jsonb),
            (i->>'dismissedUntil')::timestamptz, (i->>'createdAt')::timestamptz, (i->>'updatedAt')::timestamptz
        FROM jsonb_array_elements(COALESCE(state->'insights', '[]'::jsonb)) AS i
        ON CONFLICT (id) DO NOTHING;

        -- 12. Weekly Reviews
        INSERT INTO weekly_reviews (
            id, user_id, week_start, week_end, stats, per_project, highlights, markdown, created_at, closed_at
        )
        SELECT
            w->>'id', user_id, w->>'weekStart', w->>'weekEnd', COALESCE(w->'stats', '{}'::jsonb),
            COALESCE(w->'perProject', '[]'::jsonb), COALESCE(w->'highlights', '[]'::jsonb),
            w->>'markdown', (w->>'createdAt')::timestamptz, (w->>'closedAt')::timestamptz
        FROM jsonb_array_elements(COALESCE(state->'weeklyReviews', '[]'::jsonb)) AS w
        ON CONFLICT (id) DO NOTHING;

        -- 13. Weekly Snapshots
        INSERT INTO weekly_snapshots (
            id, user_id, week_start, week_end, data
        )
        SELECT
            s->>'id', user_id, s->>'weekStart', s->>'weekEnd', COALESCE(s->'data', '{}'::jsonb)
        FROM jsonb_array_elements(COALESCE(state->'weeklySnapshots', '[]'::jsonb)) AS s
        ON CONFLICT (id) DO NOTHING;

        -- 14. Today Plans
        INSERT INTO today_plans (
            date, user_id, task_ids, generated_at, source, notes
        )
        SELECT
            entry.key, user_id, COALESCE(entry.value->'taskIds', '[]'::jsonb), (entry.value->>'generatedAt')::timestamptz,
            entry.value->>'source', entry.value->>'notes'
        FROM jsonb_each(COALESCE(state->'todayPlanByDate', '{}'::jsonb)) AS entry
        ON CONFLICT (user_id, date) DO NOTHING;

    END LOOP;
END $$;
