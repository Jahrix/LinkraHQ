import React, { useEffect, useState } from "react";

const navItems = [
  { id: "Dashboard", icon: "❖", label: "Home" },
  { id: "Daily Goals", icon: "✓", label: "Goals" },
  { id: "Roadmap", icon: "◫", label: "Roadmap" },
  { id: "Weekly Review", icon: "📅", label: "Review" },
  { id: "Commits", icon: "⎇", label: "Commits" },
  { id: "Tools", icon: "🔧", label: "Tools" },
  { id: "Settings", icon: "⚙️", label: "Settings" },
  { id: "Account", icon: "👤", label: "Account" }
] as const;

export type NavItem = (typeof navItems)[number]["id"];

export default function Sidebar({ active, onChange }: { active: NavItem; onChange: (item: NavItem) => void }) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const isLightMode = document.documentElement.classList.contains("light");
    setIsLight(isLightMode);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("light");
    setIsLight(!isLight);
  };

  return (
    <aside className="fixed bottom-0 left-0 right-0 w-full flex-row lg:static lg:flex-col lg:w-[80px] lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto lg:self-start lg:flex-shrink-0 flex justify-between items-center px-2 py-2 lg:px-0 lg:py-6 bg-bg border-t lg:border-t-0 lg:border-r border-stroke z-40 shadow-2xl lg:shadow-none">
      {/* Top logo - desktop only */}
      <div className="hidden lg:flex lg:mb-8 text-2xl items-center justify-center w-full">
        <span role="img" aria-label="Logo">✨</span>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-row lg:flex-col gap-0.5 lg:gap-2 flex-1 justify-around lg:justify-start overflow-x-auto no-scrollbar items-center px-1 lg:px-0">
        {navItems.filter(item => item.id !== "Account").map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              title={item.id}
              aria-label={item.id}
              className={`flex-shrink-0 flex flex-col lg:flex-row items-center justify-center lg:justify-center gap-0.5 lg:gap-0 
                w-12 h-12 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl transition-all duration-200 relative
                ${isActive
                  ? "text-white"
                  : "text-muted hover:text-strong hover:bg-white/5"
                }`}
              onClick={() => onChange(item.id)}
            >
              {/* Active indicator dot on mobile (bottom), bar on desktop (left) */}
              {isActive && (
                <>
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full bg-accent lg:hidden" />
                  <span className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-accent" />
                </>
              )}
              <span className={`text-base lg:text-xl leading-none ${isActive ? "drop-shadow-[0_0_8px_rgba(139,92,246,0.7)]" : ""}`}>
                {item.icon}
              </span>
              <span className={`text-[9px] lg:hidden leading-none tracking-tight font-medium ${isActive ? "text-accent" : "text-muted"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="flex flex-row lg:flex-col gap-1 lg:gap-3 mt-0 lg:mt-auto items-center border-l lg:border-l-0 lg:border-t border-stroke/40 pl-2 lg:pl-0 lg:pt-4 ml-1 lg:ml-0">
        <button
          onClick={toggleTheme}
          className="w-10 h-10 lg:w-10 lg:h-10 flex flex-col items-center justify-center rounded-xl hover:bg-white/5 transition text-base gap-0.5"
          title="Toggle Theme"
        >
          <span>{isLight ? "🌙" : "☀️"}</span>
          <span className="text-[9px] lg:hidden text-muted leading-none">Theme</span>
        </button>
        <button
          onClick={() => onChange("Account")}
          className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center overflow-hidden transition gap-0.5 ${active === "Account"
              ? "text-accent"
              : "text-muted hover:text-strong hover:bg-white/5"
            }`}
          title="My Profile"
        >
          <span role="img" aria-label="User" className="text-base leading-none">👤</span>
          <span className="text-[9px] lg:hidden leading-none tracking-tight font-medium">Me</span>
          {active === "Account" && (
            <span className="absolute bottom-0.5 w-4 h-1 rounded-full bg-accent lg:hidden" />
          )}
        </button>
      </div>
    </aside>
  );
}
