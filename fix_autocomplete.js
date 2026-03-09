const fs = require('fs');
const path = 'apps/web/src/pages/DashboardPage.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldAutoComplete = `  const autoCompleteFromCommits = async () => {
    if (!state || !projects.length) return;
    const confirmed = window.confirm(
      "This will scan commits and auto-mark matching tasks as done. Continue?"
    );
    if (!confirmed) return;
    push("Scanning commits for task matches...", "info");
    let completions = 0;
    const next = cloneAppState(state);
    const githubToken = await resolveGithubToken();

    if (!githubToken) {
      push(GITHUB_CONNECT_MESSAGE, "warning");
      return;
    }

    for (const project of projects) {
      const repo = project.remoteRepo ?? project.githubRepo;
      if (!repo || project.status === "Archived") continue;

      const openTasks = project.tasks.filter(t => !t.done);
      if (!openTasks.length) continue;

      for (const task of openTasks) {
        try {
          const match = await matchGithubCommit(normalizeRepo(repo), task.text, githubToken);
          if (match) {
            const nextProject = next.projects.find(p => p.id === project.id);
            const nextTask = nextProject?.tasks.find(t => t.id === task.id);
            if (nextTask) {
              nextTask.done = true;
              nextTask.status = "done";
              nextTask.completedAt = new Date().toISOString();
              nextTask.linkedCommit = match;
              completions++;
            }
          }
        } catch (err) {
          console.error(\`Auto-complete failed for task \${task.id}:\`, err);
        }
      }
    }

    if (completions > 0) {
      const saved = await save(next);
      if (saved) {
        push(\`Auto-completed \${completions} tasks from commits!\`, "success");
      }
    } else {
      push("Checked commits. No new task matches found.", "info");
    }
  };`;

const newAutoComplete = `  const autoCompleteFromCommits = async () => {
    if (!state || !projects.length) return;
    const confirmed = window.confirm(
      "This will scan commits and auto-mark matching tasks as done. Continue?"
    );
    if (!confirmed) return;
    push("Scanning commits for task matches...", "info");
    
    const githubToken = await resolveGithubToken();
    if (!githubToken) {
      push(GITHUB_CONNECT_MESSAGE, "warning");
      return;
    }

    // Step 1: Gather matches without locking a stale state clone
    const foundMatches: { projectId: string; taskId: string; match: any }[] = [];
    
    for (const project of projects) {
      const repo = project.remoteRepo ?? project.githubRepo;
      if (!repo || project.status === "Archived") continue;

      const openTasks = project.tasks.filter(t => !t.done);
      if (!openTasks.length) continue;

      for (const task of openTasks) {
        try {
          const match = await matchGithubCommit(normalizeRepo(repo), task.text, githubToken);
          if (match) {
            foundMatches.push({ projectId: project.id, taskId: task.id, match });
          }
        } catch (err) {
          console.error(\`Auto-complete failed for task \${task.id}:\`, err);
        }
      }
    }

    // Step 2: Apply all matches transactionally to the freshest state
    if (foundMatches.length > 0) {
      const saved = await persistState((next) => {
        for (const { projectId, taskId, match } of foundMatches) {
          const project = next.projects.find(p => p.id === projectId);
          const task = project?.tasks.find(t => t.id === taskId);
          if (task && !task.done) {
            task.done = true;
            task.status = "done";
            task.completedAt = new Date().toISOString();
            task.linkedCommit = match;
          }
        }
      }, "Failed to apply auto-completions.");
      
      if (saved) {
        push(\`Auto-completed \${foundMatches.length} tasks from commits!\`, "success");
      }
    } else {
      push("Checked commits. No new task matches found.", "info");
    }
  };`;

code = code.replace(oldAutoComplete, newAutoComplete);
fs.writeFileSync(path, code);
console.log("Auto complete fix applied");
