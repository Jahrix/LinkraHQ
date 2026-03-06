import React, { useEffect, useState } from "react";

const navItems = [
  { id: "Dashboard", icon: "❖" },
  { id: "Daily Goals", icon: "✓" },
  { id: "Roadmap", icon: "◫" },
  { id: "Weekly Review", icon: "📅" },
  { id: "Commits", icon: "⎇" },
  { id: "Tools", icon: "🔧" },
  { id: "Settings", icon: "⚙️" },
  { id: "Account", icon: "👤" } // Will be hidden from top icons, just used as a type ID.
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
    <aside className="fixed bottom-0 left-0 right-0 w-full flex-row lg:static lg:flex-col lg:w-[80px] lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto lg:self-start lg:flex-shrink-0 flex justify-between items-center px-4 py-3 lg:px-0 lg:py-6 bg-bg border-t lg:border-t-0 lg:border-r border-stroke z-40 shadow-xl lg:shadow-none">
      {/* Top logo - Hidden on mobile, visible on desktop */}
      <div className="hidden lg:block lg:mb-8 text-2xl">
        <span role="img" aria-label="Logo">✨</span>
      </div>

      {/* Nav Actions */}
      <nav className="flex flex-row lg:flex-col gap-2 lg:gap-4 flex-1 justify-center overflow-x-auto no-scrollbar items-center">
        {navItems.filter(item => item.id !== "Account").map((item) => (
          <button
            key={item.id}
            title={item.id}
            className={`flex-shrink-0 w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-xl lg:rounded-2xl transition text-lg lg:text-xl ${active === item.id ? "bg-black text-strong" : "text-muted hover:text-strong"
              }`}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="flex flex-row lg:flex-col gap-3 lg:gap-4 mt-0 lg:mt-auto items-center ml-2 lg:ml-0 border-l lg:border-l-0 lg:border-t border-stroke/50 pl-3 lg:pl-0 lg:pt-3">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center rounded-full bg-muted hover:bg-strong transition text-sm lg:text-lg"
          title="Toggle Theme"
        >
          {isLight ? "🌙" : "☀️"}
        </button>
        <button
          onClick={() => onChange("Account")}
          className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center overflow-hidden transition ${active === "Account" ? "ring-2 ring-accent bg-accent/20" : "border border-accent/40 bg-accent/10 hover:bg-accent/20"}`}
          title="My Profile"
        >
          <span role="img" aria-label="User" className="text-sm lg:text-xl">👤</span>
        </button>
      </div>
    </aside>
  );
}
