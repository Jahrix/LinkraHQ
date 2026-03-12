-- Create RPC functions to sync between JSON state and normalized tables

CREATE OR REPLACE FUNCTION get_complete_app_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id UUID := auth.uid();
    result JSONB;
BEGIN
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT jsonb_build_object(
        'metadata', jsonb_build_object(
            'schema_version', 3,
            'created_at', NOW()
        ),
        'userSettings', (
            SELECT COALESCE(
                jsonb_build_object(
                    'theme', theme,
                    'accent', accent,
                    'reduceMotion', reduce_motion,
                    'startOnLogin', start_on_login,
                    'selectedRepos', selected_repos,
                    'goalTemplate', goal_template,
                    'repoWatchDirs', repo_watch_dirs,
                    'repoScanIntervalMinutes', repo_scan_interval_minutes,
                    'repoExcludePatterns', repo_exclude_patterns,
                    'gitWatcherEnabled', git_watcher_enabled,
                    'githubPat', github_pat,
                    'disabledInsightRules', disabled_insight_rules,
                    'enableDailyBackup', enable_daily_backup,
                    'backupRetentionDays', backup_retention_days,
                    'schemaVersion', schema_version
                ),
                '{"theme": "dark", "accent": "#5DD8FF", "reduceMotion": false, "startOnLogin": false, "selectedRepos": [], "goalTemplate": [], "repoWatchDirs": [], "repoScanIntervalMinutes": 15, "repoExcludePatterns": ["**/node_modules/**", "**/.git/**"], "gitWatcherEnabled": true, "githubPat": null, "disabledInsightRules": [], "enableDailyBackup": true, "backupRetentionDays": 14, "schemaVersion": 3}'::jsonb
            )
            FROM user_settings WHERE user_settings.user_id = auth.uid()
        ),
        'projects', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', p.name,
                    'subtitle', p.subtitle,
                    'icon', p.icon,
                    'color', p.color,
                    'status', p.status,
                    'progress', p.progress,
                    'weeklyHours', p.weekly_hours,
                    'logoUrl', p.logo_url,
                    'githubRepo', p.github_repo,
                    'remoteRepo', p.remote_repo,
                    'localRepoPath', p.local_repo_path,
                    'healthScore', p.health_score,
                    'archivedAt', p.archived_at,
                    'createdAt', p.created_at,
                    'updatedAt', p.updated_at,
                    'tasks', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', t.id,
                                'text', t.text,
                                'done', t.done,
                                'status', t.status,
                                'dependsOnIds', t.depends_on_ids,
                                'priority', t.priority,
                                'dueDate', t.due_date,
                                'milestone', t.milestone,
                                'createdAt', t.created_at,
                                'completedAt', t.completed_at,
                                'linkedCommit', t.linked_commit
                            )
                        )
                        FROM project_tasks t WHERE t.project_id = p.id AND t.user_id = auth.uid()
                    ), '[]'::jsonb)
                )
            )
            FROM projects p WHERE p.user_id = auth.uid()
        ), '[]'::jsonb),
        'localRepos', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'name', r.name,
                    'path', r.path,
                    'watchDir', r.watch_dir,
                    'remoteUrl', r.remote_url,
                    'defaultBranch', r.default_branch,
                    'lastCommitAt', r.last_commit_at,
                    'lastCommitMessage', r.last_commit_message,
                    'lastCommitAuthor', r.last_commit_author,
                    'dirty', r.dirty,
                    'untrackedCount', r.untracked_count,
                    'ahead', r.ahead,
                    'behind', r.behind,
                    'todayCommitCount', r.today_commit_count,
                    'lastHeadSha', r.last_head_sha,
                    'lastStatusHash', r.last_status_hash,
                    'lastScanDurationMs', r.last_scan_duration_ms,
                    'scanError', r.scan_error,
                    'scannedAt', r.scanned_at
                )
            )
            FROM local_repos r WHERE r.user_id = auth.uid()
        ), '[]'::jsonb),
        'dailyGoalsByDate', COALESCE((
            SELECT jsonb_object_agg(
                e.date,
                jsonb_build_object(
                    'date', e.date,
                    'score', e.score,
                    'completedPoints', e.completed_points,
                    'isClosed', e.is_closed,
                    'archivedAt', e.archived_at,
                    'goals', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', g.id,
                                'title', g.title,
                                'category', g.category,
                                'points', g.points,
                                'done', g.done,
                                'createdAt', g.created_at,
                                'completedAt', g.completed_at
                            )
                        )
                        FROM daily_goals g WHERE g.entry_date = e.date AND g.user_id = auth.uid()
                    ), '[]'::jsonb)
                )
            )
            FROM daily_goals_entries e WHERE e.user_id = auth.uid()
        ), '{}'::jsonb),
        'roadmapCards', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', c.id,
                    'lane', c.lane,
                    'title', c.title,
                    'description', c.description,
                    'tags', c.tags,
                    'linkedRepo', c.linked_repo,
                    'dueDate', c.due_date,
                    'project', c.project,
                    'createdAt', c.created_at,
                    'updatedAt', c.updated_at
                )
            )
            FROM roadmap_cards c WHERE c.user_id = auth.uid()
        ), '[]'::jsonb),
        'sessionLogs', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'ts', l.ts,
                    'text', l.text,
                    'project', l.project,
                    'tags', l.tags
                )
            )
            FROM session_logs l WHERE l.user_id = auth.uid()
        ), '[]'::jsonb),
        'focusSessions', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', fs.id,
                    'startedAt', fs.started_at,
                    'durationMinutes', fs.duration_minutes,
                    'completedAt', fs.completed_at,
                    'planned', fs.planned,
                    'projectId', fs.project_id,
                    'reason', fs.reason
                )
            )
            FROM focus_sessions fs WHERE fs.user_id = auth.uid()
        ), '[]'::jsonb),
        'quickCaptures', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', qc.id,
                    'type', qc.type,
                    'text', qc.text,
                    'createdAt', qc.created_at
                )
            )
            FROM quick_captures qc WHERE qc.user_id = auth.uid()
        ), '[]'::jsonb),
        'journalEntries', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', j.id,
                    'projectId', j.project_id,
                    'ts', j.ts,
                    'type', j.type,
                    'title', j.title,
                    'body', j.body,
                    'links', j.links,
                    'tags', j.tags,
                    'createdAt', j.created_at,
                    'updatedAt', j.updated_at
                )
            )
            FROM journal_entries j WHERE j.user_id = auth.uid()
        ), '[]'::jsonb),
        'insights', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', i.id,
                    'ts', i.ts,
                    'severity', i.severity,
                    'projectId', i.project_id,
                    'repoId', i.repo_id,
                    'ruleId', i.rule_id,
                    'title', i.title,
                    'reason', i.reason,
                    'metrics', i.metrics,
                    'suggestedActions', i.suggested_actions,
                    'dismissedUntil', i.dismissed_until,
                    'createdAt', i.created_at,
                    'updatedAt', i.updated_at
                )
            )
            FROM insights i WHERE i.user_id = auth.uid()
        ), '[]'::jsonb),
        'weeklyReviews', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', w.id,
                    'weekStart', w.week_start,
                    'weekEnd', w.week_end,
                    'stats', w.stats,
                    'perProject', w.per_project,
                    'highlights', w.highlights,
                    'markdown', w.markdown,
                    'createdAt', w.created_at,
                    'closedAt', w.closed_at
                )
            )
            FROM weekly_reviews w WHERE w.user_id = auth.uid()
        ), '[]'::jsonb),
        'weeklySnapshots', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', s.id,
                    'weekStart', s.week_start,
                    'weekEnd', s.week_end,
                    'data', s.data
                )
            )
            FROM weekly_snapshots s WHERE s.user_id = auth.uid()
        ), '[]'::jsonb),
        'todayPlanByDate', COALESCE((
            SELECT jsonb_object_agg(
                t.date,
                jsonb_build_object(
                    'taskIds', t.task_ids,
                    'generatedAt', t.generated_at,
                    'source', t.source,
                    'notes', t.notes
                )
            )
            FROM today_plans t WHERE t.user_id = auth.uid()
        ), '{}'::jsonb),
        'github', '{"loggedIn": false, "user": null, "lastSyncAt": null, "rateLimit": null}'::jsonb
    ) INTO result;

    RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION sync_app_state(state_json JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    uid UUID := auth.uid();
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Update legacy user_state table for complete backward compatibility during transition
    INSERT INTO user_state (id, state) VALUES (uid, state_json)
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW();

    -- We intentionally do NOT execute the full normalization sync here.
    -- The frontend will be transitioned gradually to write directly to normalized tables.
    -- The full data migration handles existing data.
    
END;
$$;
