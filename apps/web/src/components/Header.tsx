import React from "react";
import { formatDay } from "../lib/date";

export default function Header({
  score,
  onOpenCommand
}: {
  score: number;
  onOpenCommand: () => void;
}) {
  return (
    <header className="header">
      <div>
        <h2 style={{ fontSize: "1.4rem" }}>Lock-in Dashboard</h2>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>{formatDay(new Date())}</p>
      </div>
      <div className="header-right">
        <div className="glass panel">
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Lock-in Score</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>{score}</div>
        </div>
        <button className="glass panel" onClick={onOpenCommand}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Command Palette</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Open</span>
            <span className="kbd">Ctrl/Cmd + K</span>
          </div>
        </button>
      </div>
    </header>
  );
}
