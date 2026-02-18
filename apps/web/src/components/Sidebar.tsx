import React from "react";

const navItems = [
  "Dashboard",
  "Daily Goals",
  "Roadmap",
  "Commits",
  "Tools",
  "Settings"
];

export type NavItem = (typeof navItems)[number];

export default function Sidebar({ active, onChange }: { active: NavItem; onChange: (item: NavItem) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>Linkra</span>
        <h1>by Jahrix</h1>
      </div>
      <nav className="nav">
        {navItems.map((item) => (
          <button
            key={item}
            className={active === item ? "active" : ""}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="glass panel">
        <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Liquid Glass mode active.</p>
        <p style={{ marginTop: 8, fontWeight: 600 }}>Lock in, stay local.</p>
      </div>
    </aside>
  );
}
