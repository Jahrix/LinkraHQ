import React from "react";

const navItems = [
  "Dashboard",
  "Daily Goals",
  "Roadmap",
  "Weekly Review",
  "Commits",
  "Tools",
  "Settings"
];

export type NavItem = (typeof navItems)[number];

export default function Sidebar({ active, onChange }: { active: NavItem; onChange: (item: NavItem) => void }) {
  return (
    <aside className="flex flex-row lg:flex-col gap-6 px-5 py-6 bg-white/5 border-b lg:border-b-0 lg:border-r border-white/10 backdrop-blur-2xl flex-wrap">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-white/50">Linkra</p>
        <h1 className="text-lg font-semibold">by Jahrix</h1>
      </div>
      <nav className="flex flex-row lg:flex-col gap-2 flex-wrap">
        {navItems.map((item) => (
          <button
            key={item}
            className={`text-left px-4 py-2 rounded-xl transition ${
              active === item ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
            }`}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="panel">
        <p className="text-xs text-white/60">Liquid Glass mode active.</p>
        <p className="mt-2 font-semibold">Lock in, stay local.</p>
      </div>
    </aside>
  );
}
