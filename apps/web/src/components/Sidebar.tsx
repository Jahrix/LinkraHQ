import React from "react";

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
  return (
    <>
      <aside className="hidden lg:flex lg:flex-col lg:w-[80px] lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto lg:self-start lg:flex-shrink-0 justify-between items-center py-6 bg-bg border-r border-stroke z-40">
        <div className="flex mb-8 items-center justify-center w-full">
          <img
            src="/logo-icon.png"
            alt="Logo"
            className="w-10 h-10 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
            loading="eager"
            // @ts-ignore
            fetchpriority="high"
          />
        </div>

        {/* Desktop Nav Items */}
        <nav className="flex flex-col gap-2 flex-1 justify-start w-full items-center">
          {navItems.filter(item => item.id !== "Account").map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                title={item.id}
                aria-label={item.id}
                className={`flex-shrink-0 flex flex-col items-center justify-center gap-0 w-12 h-12 rounded-2xl transition-all duration-200 relative
                  ${isActive
                    ? "text-white"
                    : "text-muted hover:text-strong hover:bg-white/5"
                  }`}
                onClick={() => onChange(item.id)}
              >
                {/* Active indicator vertical bar on desktop */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-accent" />
                )}
                <span className={`text-xl leading-none ${isActive ? "drop-shadow-[0_0_8px_rgba(139,92,246,0.7)]" : ""}`}>
                  {item.icon}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Desktop Account Item */}
        <div className="flex flex-col gap-3 mt-auto items-center border-t border-stroke/40 pt-4 w-full">
          <button
            onClick={() => onChange("Account")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition ${active === "Account"
              ? "text-accent"
              : "text-muted hover:text-strong hover:bg-white/5"
              }`}
            title="My Profile"
          >
            <span role="img" aria-label="User" className="text-base leading-none relative">
              👤
              {active === "Account" && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-3 rounded-full bg-accent" />
              )}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
