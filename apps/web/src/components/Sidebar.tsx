import React, { useEffect, useState } from "react";

const navItems = [
  { id: "Dashboard", icon: "❖" },
  { id: "Daily Goals", icon: "✓" },
  { id: "Roadmap", icon: "◫" },
  { id: "Weekly Review", icon: "📅" },
  { id: "Commits", icon: "⎇" },
  { id: "Tools", icon: "🔧" },
  { id: "Settings", icon: "⚙️" }
] as const;

export type NavItem = (typeof navItems)[number]["id"];

export default function Sidebar({ active, onChange }: { active: NavItem; onChange: (item: NavItem) => void }) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Dark mode is default, we only toggle the .light class
    const isLightMode = document.documentElement.classList.contains("light");
    setIsLight(isLightMode);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("light");
    setIsLight(!isLight);
  };

  return (
    <aside className="flex flex-row space-around w-full lg:flex-col lg:w-[80px] lg:h-screen lg:justify-between items-center py-6 bg-subtle border-b lg:border-b-0 lg:border-r border-stroke">
      {/* Top logo */}
      <div className="flex-shrink-0 lg:mb-8 text-2xl">
        <span role="img" aria-label="Logo">✨</span>
      </div>

      {/* Nav Actions */}
      <nav className="flex flex-row lg:flex-col gap-4 flex-1 justify-center">
        {navItems.map((item) => (
          <button
            key={item.id}
            title={item.id}
            className={`w-12 h-12 flex items-center justify-center rounded-2xl transition text-xl ${active === item.id ? "bg-black text-strong" : "text-muted hover:text-strong"
              }`}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="flex flex-row lg:flex-col gap-4 mt-auto items-center">
        <button
          onClick={toggleTheme}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-muted hover:bg-strong transition text-lg"
          title="Toggle Theme"
        >
          {isLight ? "🌙" : "☀️"}
        </button>
        <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center overflow-hidden">
          <span role="img" aria-label="User" className="text-xl">👤</span>
        </div>
      </div>
    </aside>
  );
}
