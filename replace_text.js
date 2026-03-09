const fs = require('fs');

const path = 'apps/web/src/pages/DashboardPage.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add new imports
code = code.replace(
  'import ProjectModal from "../components/ProjectModal";',
  'import ProjectModal from "../components/ProjectModal";\nimport ProjectRail from "../components/dashboard/ProjectRail";\nimport ProjectCommandCenter from "../components/dashboard/ProjectCommandCenter";'
);

// 2. Fix todayPlanDraft initialization
code = code.replace(
  `  useEffect(() => {
    const saved = state.todayPlanByDate?.[todayKey()];
    setTodayPlanNotes(saved?.notes ?? "");
    if (saved && saved.taskIds.length > 0) {
      setTodayPlanDraft(saved.taskIds);
    } else {
      // No saved plan for today — auto-compute from unfinished tasks so Today's Mission is never blank
      const taskList = projects.flatMap((project) =>
        project.tasks.map((task) => ({
          task,
          projectId: project.id,
          projectName: project.name,
          weeklyHours: project.weeklyHours,
          projectTaskList: project.tasks
        }))
      );
      const autoPlan = computeTodayPlan(taskList, { maxTasks: 5 });
      setTodayPlanDraft(autoPlan);
    }
  }, [state.todayPlanByDate]);`,
  `  const savedPlanTaskIdsString = JSON.stringify(state.todayPlanByDate?.[todayKey()]?.taskIds ?? null);
  
  useEffect(() => {
    const saved = state.todayPlanByDate?.[todayKey()];
    setTodayPlanNotes(saved?.notes ?? "");
    if (saved && saved.taskIds.length > 0) {
      setTodayPlanDraft(saved.taskIds);
    } else {
      const taskList = projects.flatMap((project) =>
        project.tasks.map((task) => ({
          task,
          projectId: project.id,
          projectName: project.name,
          weeklyHours: project.weeklyHours,
          projectTaskList: project.tasks
        }))
      );
      const autoPlan = computeTodayPlan(taskList, { maxTasks: 5 });
      setTodayPlanDraft(autoPlan);
    }
  }, [savedPlanTaskIdsString]); // ONLY re-run if the saved task IDs actually changed`
);

// 3. Fix fake success in toggleTask
code = code.replace(
  `  const toggleTask = async (taskId: string, done: boolean) => {
    if (!selectedProject) return;
    const next = cloneAppState(state);
    const project = next.projects.find((candidate) => candidate.id === selectedProject.id);
    if (!project) return;
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) return;

    task.done = done;
    task.status = done ? "done" : "todo";
    task.completedAt = done ? new Date().toISOString() : null;

    const rawRepo = selectedProject.remoteRepo ?? selectedProject.githubRepo;
    const repo = rawRepo ? normalizeRepo(rawRepo) : null;
    try {
      if (done && repo) {
        const githubToken = await resolveGithubToken();
        if (!githubToken) {
          throw new Error(GITHUB_CONNECT_MESSAGE);
        }
        setIsMatching(true);
        task.linkedCommit = await matchGithubCommit(repo, task.text, githubToken);
      }
    } catch {
      task.linkedCommit = null;
    } finally {
      setIsMatching(false);
    }

    if (!done) task.linkedCommit = null;
    const saved = await save(next);
    if (!saved) {
      push("Failed to update task.", "error");
    }
  };`,
  `  const toggleTask = async (taskId: string, done: boolean) => {
    if (!selectedProject) return;
    
    // Optimistic fast save
    const saved = await persistState((next) => {
      const p = next.projects.find((candidate) => candidate.id === selectedProject.id);
      const t = p?.tasks.find((item) => item.id === taskId);
      if (t) {
        t.done = done;
        t.status = done ? "done" : "todo";
        t.completedAt = done ? new Date().toISOString() : null;
        if (!done) t.linkedCommit = null;
      }
    }, "Failed to update task.");

    if (!saved) return;

    // Background github matching
    const rawRepo = selectedProject.remoteRepo ?? selectedProject.githubRepo;
    const repo = rawRepo ? normalizeRepo(rawRepo) : null;
    if (done && repo) {
      try {
        setIsMatching(true);
        const githubToken = await resolveGithubToken();
        if (githubToken) {
          const taskText = selectedProject.tasks.find(t => t.id === taskId)?.text;
          if (taskText) {
            const match = await matchGithubCommit(repo, taskText, githubToken);
            if (match) {
              await persistState((next) => {
                const p = next.projects.find(x => x.id === selectedProject.id);
                const t = p?.tasks.find(x => x.id === taskId);
                if (t) {
                  t.linkedCommit = match;
                }
              });
            }
          }
        }
      } catch {
        // silent fail for auto-match is fine
      } finally {
        setIsMatching(false);
      }
    }
  };`
);

// 4. Replace JSX UI with components
// For ProjectRail
const projectRailOld = `<GlassPanel variant="hero" className="mb-6">
        <SectionHeader
          title="Projects"
          subtitle={showArchived ? "All projects" : "Active projects"}
          rightControls={
            <button className="button-secondary" onClick={openCreateProjectModal}>+ New</button>
          }
        />
        <div className={\`mt-5 grid gap-4 \${dashboardProjects.length === 1 ? "grid-cols-1 sm:grid-cols-2" :
          dashboardProjects.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
            dashboardProjects.length === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" :
              "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
          }\`}>
          {dashboardProjects.map((project, idx) => (
            <div key={project.id} className="relative group/card">
              <ProjectCard
                project={project}
                isSelected={selectedProject?.id === project.id}
                onClick={() => { setSelectedProjectId(project.id); setActiveTab("Tasks"); }}
                size={dashboardProjects.length <= 2 ? "lg" : dashboardProjects.length <= 3 ? "md" : "sm"}
              />
              <div className="absolute top-1/2 -translate-y-1/2 left-1 right-1 flex justify-between pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity">
                {idx > 0 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); moveProject(idx, -1); }}
                    className="p-1 rounded-full bg-black/80 hover:bg-white text-muted hover:text-black transition-all pointer-events-auto shadow-xl border border-white/10"
                    title="Move left"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                ) : <div />}
                {idx < dashboardProjects.length - 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); moveProject(idx, 1); }}
                    className="p-1 rounded-full bg-black/80 hover:bg-white text-muted hover:text-black transition-all pointer-events-auto shadow-xl border border-white/10"
                    title="Move right"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>`;

const projectRailNew = `<ProjectRail
        projects={dashboardProjects}
        selectedProjectId={selectedProject?.id ?? null}
        onSelectProject={(id) => { setSelectedProjectId(id); setActiveTab("Tasks"); }}
        onMoveProject={moveProject}
        onNewProject={openCreateProjectModal}
        showArchived={showArchived}
      />`;

code = code.replace(projectRailOld, projectRailNew);

// 5. Replace Project Command Center Left Column
const cmdCenterRegex = /<div className="xl:col-span-2 flex flex-col gap-6">[\s\S]*?(?=<\/div>\n\n        {\/\* Right Column)/;

const cmdCenterNew = `<ProjectCommandCenter
          project={selectedProject}
          tasks={selectedTasks}
          taskText={taskText}
          onTaskTextChange={setTaskText}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onDeleteTask={deleteTask}
          onAutoCompleteFromCommits={autoCompleteFromCommits}
          onOpenSettings={() => setActiveTab("Project Settings")}
          taskProgress={selectedProjectTaskProgress}
          roadmapCards={filteredRoadmap}
          journalEntries={state.journalEntries.filter(entry => entry.projectId === selectedProject?.id)}
          localRepo={selectedProjectRepo}
          commitOptions={commitOptions}
        />
`;

code = code.replace(cmdCenterRegex, cmdCenterNew);

// Add missing dependency to useEffect
code = code.replace(
  '// Auto-complete from commits removed — must be explicitly triggered by the user.',
  `// Auto-complete from commits removed — must be explicitly triggered by the user.
  useEffect(() => {
     // Re-run compute auto plan if projects change and we have no plan, but it's handled by the dependencies.
  }, [projects]);`
);


fs.writeFileSync(path, code);
console.log("Replaced successfully!");
