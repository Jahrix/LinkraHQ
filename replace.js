const fs = require('fs');

const path = 'apps/web/src/pages/DashboardPage.tsx';
const content = fs.readFileSync(path, 'utf8');

const returnRegex = /return \([\s\S]*?(?=\n\}\n\nfunction deadlineLabel)/;

const newJSX = `return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        {/* TOP ROW */}
        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 px-2 pb-2">Capacity / Budget</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{totalHours} <span className="text-xl text-white/50">hrs</span></div>
            <div className="text-sm font-medium text-blue-400/80 uppercase tracking-widest">{selectedProjectBudgetShare}% Active</div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 px-2 pb-2">Daily Goals</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{todayEntry?.score ?? 0}%</div>
            <div className="text-sm font-medium text-emerald-400">
               {todayEntry?.completedPoints ?? 0}/{todayEntry?.goals.length ?? 0} pts
            </div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 px-2 pb-2">Actions</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold tracking-tight">{visibleInsightCount}</div>
            <div className="text-sm font-medium text-amber-400">Pending</div>
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 border-emerald-500/20 flex flex-col justify-between">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/70 px-2 pb-2">Activity</div>
          <div className="flex justify-between items-end mt-2 px-2">
            <div className="text-3xl font-semibold text-emerald-100 tracking-tight">Ready</div>
            <button className="button-primary bg-emerald-600 border-none text-white text-xs px-4 py-1">Focus</button>
          </div>
        </GlassPanel>

        {/* MIDDLE ROW */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassPanel variant="hero" className="flex-1">
            <SectionHeader
              title="Projects"
              subtitle={showArchived ? "All projects" : "Active projects"}
              rightControls={
                <button className="button-secondary" onClick={openCreateProjectModal}>+ New</button>
              }
            />
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleProjects.slice(0, 4).map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const tasksDone = project.tasks.filter((task) => task.done).length;
                const tasksTotal = project.tasks.length;
                return (
                  <button 
                    key={project.id}
                    className={\`text-left p-4 rounded-xl border transition \${isSelected ? 'bg-white/10 border-white/20 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10'}\`}
                    onClick={() => { setSelectedId(project.id); setActiveTab("Tasks"); }}
                  >
                    <div className="flex justify-between">
                      <span className="text-2xl">{project.icon}</span>
                      <span className="text-xs text-white/50 px-2 py-1 rounded bg-white/5 border border-white/10">{project.weeklyHours}h</span>
                    </div>
                    <div className="mt-3 font-semibold truncate text-[15px]">{project.name}</div>
                    <div className="mt-1 flex justify-between items-center text-xs text-white/50">
                       <span className="truncate">{project.status}</span>
                       <span>{tasksDone}/{tasksTotal} done</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassPanel>
        </div>

        <GlassPanel variant="standard" className="flex flex-col items-center justify-center text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-7">Task Progress</div>
          <div className="relative w-36 h-36 flex items-center justify-center group mb-5">
             <div className="absolute inset-0 rounded-full border-[10px] border-white/5"></div>
             <div 
               className="absolute inset-0 rounded-full border-[10px] border-accent"
               style={{ 
                 clipPath: 'polygon(50% 0%, 100% 0, 100% 100%, 0% 100%, 0% 0%, 50% 0%)',
                 transform: \`rotate(\${(tasksProgress / 100) * 360}deg)\`
               }}
             ></div>
             <div className="text-4xl font-semibold tracking-tight">{tasksProgress}%</div>
          </div>
          <div className="text-sm tracking-wide text-white/60">{completedTasks} of {totalTasks} global tasks</div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-5xl mb-5 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            {selectedProject?.icon ?? "👤"}
          </div>
          <h3 className="font-semibold text-lg tracking-tight">{selectedProject?.name ?? "No Selection"}</h3>
          <p className="text-sm text-white/50 mt-1">{selectedProject?.subtitle ?? "Select a project to view details"}</p>
          <div className="flex gap-6 mt-6 pt-6 border-t border-white/5 w-full justify-center text-sm">
            <div><strong className="block text-2xl font-semibold mb-1">{selectedProject?.tasks.length ?? 0}</strong> <span className="text-white/50 uppercase tracking-widest text-[10px]">Tasks</span></div>
            <div><strong className="block text-2xl font-semibold mb-1">{selectedProjectTaskProgress}%</strong> <span className="text-white/50 uppercase tracking-widest text-[10px]">Done</span></div>
          </div>
          {selectedProject && (
            <button className="text-xs text-accent mt-4 hover:underline" onClick={() => setActiveTab("Project Settings")}>Edit Settings</button>
          )}
        </GlassPanel>

        {/* BOTTOM ROW */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassPanel variant="standard" className="flex-1 flex flex-col min-h-[300px]">
            <SectionHeader title="Tasks" subtitle={selectedProject?.name ?? "Global"} />
            <div className="mt-4 flex-1 grid gap-2 overflow-y-auto pr-2">
              {selectedTasks.length === 0 && <p className="text-sm text-white/50">No tasks.</p>}
              {selectedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  text={task.text}
                  done={task.done}
                  onToggle={(nextValue) => toggleTask(task.id, nextValue)}
                />
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <input 
                value={taskText} 
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                placeholder="New task..." 
                className="input flex-1"
              />
              <button onClick={addTask} className="button-secondary">Add</button>
            </div>
          </GlassPanel>
        </div>

        <GlassPanel variant="standard" className="flex flex-col h-[300px]">
          <SectionHeader title="Signals & Insights" />
          <div className="mt-4 flex-1 grid gap-3 overflow-y-auto pr-2">
            {groupedInsights.length === 0 && <p className="text-sm text-white/50">No insights to review.</p>}
            {groupedInsights.map(group => (
              <div key={group.key} className="p-3 bg-white/[0.03] rounded-xl border border-white/5">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium text-sm leading-tight text-white/90">{group.title}</div>
                  <Pill tone={group.severity === 'crit' ? 'danger' : group.severity === 'warn' ? 'warning' : 'neutral'}>
                    {group.severity}
                  </Pill>
                </div>
                <div className="text-xs text-white/50 mt-2 line-clamp-2 leading-relaxed">{group.reason}</div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel variant="standard" className="flex flex-col h-[300px]">
          <SectionHeader title="Local Git" subtitle={selectedProjectRepo?.name} />
          <div className="mt-4 flex-1 flex flex-col pt-4 items-center text-center">
             <div className="text-5xl mb-4 text-white/20">⎇</div>
             <div className="font-medium mb-1 text-lg">{selectedProject?.localRepoPath ? \`\${selectedProjectRepo?.todayCommitCount ?? 0} Commits Today\` : "Not Linked"}</div>
             <p className="text-xs text-white/50 mb-6">{selectedProject?.localRepoPath ? "Tree is clean" : "Update settings to link local path."}</p>
             {!selectedProject?.localRepoPath && (
               <button className="button-secondary" onClick={() => setActiveTab("Project Settings")}>Link Repo</button>
             )}
          </div>
        </GlassPanel>
      </div>

      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title="Create Project"
        footer={
          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={() => setProjectModalOpen(false)} aria-label="Cancel project modal">
              Cancel
            </button>
            <button className="button-primary" onClick={saveNewProject} aria-label="Create project">
              Create
            </button>
          </div>
        }
      >
        <ProjectEditorFields
          draft={projectDraft}
          setDraft={setProjectDraft}
          repos={uniqueRepos}
          githubRepoOptions={githubRepoOptions}
          githubRepoListId="project-create-github-list"
        />
      </Modal>

      {activeTab === "Project Settings" && selectedProject && (
        <Modal 
          open 
          onClose={() => setActiveTab("Tasks")} 
          title="Project Settings"
          footer={
            <div className="flex justify-end gap-3">
              <button className="button-secondary text-red-500 hover:bg-red-500/10 mr-auto border-red-500/20" onClick={() => deleteProject(selectedProject.id)}>Delete</button>
              <button className="button-secondary" onClick={() => setProjectArchived(selectedProject.id, !isArchivedProject(selectedProject))}>
                {isArchivedProject(selectedProject) ? "Restore" : "Archive"}
              </button>
              <button className="button-primary" onClick={() => { saveProjectSettings(); setActiveTab("Tasks"); }}>Save</button>
            </div>
          }
        >
          <ProjectEditorFields
            draft={projectSettingsDraft}
            setDraft={setProjectSettingsDraft}
            repos={uniqueRepos}
            githubRepoOptions={githubRepoOptions}
            githubRepoListId="project-settings-github-list"
          />
        </Modal>
      )}
    </>
  );`;

const newFileContent = content.replace(returnRegex, newJSX);

if (content !== newFileContent) {
  fs.writeFileSync(path, newFileContent, 'utf8');
  console.log('Successfully replaced return block');
} else {
  console.log('Failed to find return block');
}
