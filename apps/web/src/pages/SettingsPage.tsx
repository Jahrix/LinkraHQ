import React, { useEffect, useState } from "react";
import { ExportBundleSchema, SCHEMA_VERSION, type ExportBundle } from "@linkra/shared";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";
import { useToast } from "../lib/toast";

interface ImportPreview {
  bundle: ExportBundle;
  counts: {
    goals: number;
    roadmap: number;
    logs: number;
    focus: number;
  };
}

export default function SettingsPage() {
  const { state, save, refresh } = useAppState();
  const { push } = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [startupInfo, setStartupInfo] = useState<{ os: string; instructions: string; files: string[] } | null>(null);

  useEffect(() => {
    api.startupStatus().then(setStartupInfo).catch(() => null);
  }, []);

  if (!state) return null;

  const handleExport = async () => {
    const bundle = await api.exportState();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkra-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const parsed = ExportBundleSchema.parse(data);
      const counts = {
        goals: Object.values(parsed.data.dailyGoalsByDate).reduce((sum, entry) => sum + entry.goals.length, 0),
        roadmap: parsed.data.roadmapCards.length,
        logs: parsed.data.sessionLogs.length,
        focus: parsed.data.focusSessions.length
      };
      setPreview({ bundle: parsed, counts });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON schema");
      setPreview(null);
    }
  };

  const applyImport = async (mode: "replace" | "merge") => {
    if (!preview) return;
    const result = await api.importState(mode, preview.bundle);
    await save(result.state);
    setPreview(null);
    push(`Import ${mode} complete.`);
  };

  const handleWipe = async () => {
    const confirm = window.confirm("This will wipe all local data. Continue?");
    if (!confirm) return;
    const result = await api.wipeState();
    await save(result.state);
    push("Local data wiped.");
  };

  const generateStartup = async () => {
    const result = await api.createStartup();
    setStartupInfo(result);
    push("Startup files generated.");
  };

  const toggleStartup = async (enabled: boolean) => {
    const next = { ...state };
    next.userSettings.startOnLogin = enabled;
    await save(next);
    if (enabled) {
      await generateStartup();
    }
  };

  const updateAppearance = async (key: "accent" | "reduceMotion", value: string | boolean) => {
    const next = { ...state };
    if (key === "accent" && typeof value === "string") {
      next.userSettings.accent = value;
    }
    if (key === "reduceMotion" && typeof value === "boolean") {
      next.userSettings.reduceMotion = value;
    }
    await save(next);
  };

  const logout = async () => {
    await api.logout();
    await refresh();
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="glass panel">
        <h3>GitHub</h3>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          {state.github.loggedIn
            ? `Connected as ${state.github.user?.login ?? "GitHub user"}.`
            : "Not connected. Login to sync commits."}
        </p>
        <div className="filter-row" style={{ marginTop: 12 }}>
          {!state.github.loggedIn && (
            <a className="button-primary" href="/auth/github/start">
              Login with GitHub
            </a>
          )}
          {state.github.loggedIn && (
            <button className="button-secondary" onClick={logout}>
              Logout
            </button>
          )}
        </div>
      </div>

      <div className="glass panel">
        <h3>Data</h3>
        <div className="filter-row" style={{ marginTop: 12 }}>
          <button className="button-primary" onClick={handleExport}>
            Export JSON
          </button>
          <label className="button-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Import JSON
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleImportFile(file);
              }}
            />
          </label>
          <button className="button-secondary" onClick={handleWipe}>
            Wipe Local Data
          </button>
        </div>
        {importError && <p style={{ color: "salmon", marginTop: 8 }}>{importError}</p>}
        {preview && (
          <div className="glass panel" style={{ marginTop: 16 }}>
            <h4>Import Preview</h4>
            <p style={{ color: "var(--muted)", marginTop: 6 }}>
              Schema {preview.bundle.schema_version} → {SCHEMA_VERSION}
            </p>
            <div className="table" style={{ marginTop: 12 }}>
              <div className="table-row">Goals: {preview.counts.goals}</div>
              <div className="table-row">Roadmap cards: {preview.counts.roadmap}</div>
              <div className="table-row">Session logs: {preview.counts.logs}</div>
              <div className="table-row">Focus sessions: {preview.counts.focus}</div>
            </div>
            <div className="filter-row" style={{ marginTop: 12 }}>
              <button className="button-primary" onClick={() => applyImport("replace")}>Replace All</button>
              <button className="button-secondary" onClick={() => applyImport("merge")}>Merge</button>
            </div>
          </div>
        )}
      </div>

      <div className="glass panel">
        <h3>Startup</h3>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          Generate local startup files. No admin rights needed. Copy into the OS startup folder.
        </p>
        <div className="filter-row" style={{ marginTop: 12 }}>
          <label className="toggle">
            Start on login
            <input
              type="checkbox"
              checked={state.userSettings.startOnLogin}
              onChange={(e) => toggleStartup(e.target.checked)}
            />
          </label>
          <button className="button-secondary" onClick={generateStartup}>
            Regenerate Files
          </button>
        </div>
        {startupInfo && (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "var(--muted)", marginBottom: 8 }}>Detected OS: {startupInfo.os}</p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>{startupInfo.instructions}</pre>
            <p style={{ marginTop: 8, color: "var(--muted)" }}>Generated files:</p>
            <ul style={{ marginTop: 6, marginLeft: 16 }}>
              {startupInfo.files.map((file) => (
                <li key={file} style={{ fontSize: "0.8rem" }}>
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="glass panel">
        <h3>Appearance</h3>
        <div className="filter-row" style={{ marginTop: 12 }}>
          <label className="toggle">
            Accent Color
            <input
              type="color"
              value={state.userSettings.accent}
              onChange={(e) => updateAppearance("accent", e.target.value)}
            />
          </label>
          <label className="toggle">
            Reduce Motion
            <input
              type="checkbox"
              checked={state.userSettings.reduceMotion}
              onChange={(e) => updateAppearance("reduceMotion", e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
