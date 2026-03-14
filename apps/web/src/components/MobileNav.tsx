import React, { useState } from "react";
import type { NavItem } from "./Sidebar";

const mainNavItems = [
  { id: "Dashboard", icon: "❖", label: "Home" },
  { id: "Daily Goals", icon: "✓", label: "Goals" },
  { id: "Menu", icon: "☰", label: "Menu" },
  { id: "Habits", icon: "⚡", label: "Habits" },
  { id: "Account", icon: "👤", label: "Profile" }
] as const;

const menuSheetItems = [
  { id: "Roadmap", icon: "◫", label: "Roadmap" },
  { id: "Weekly Review", icon: "📅", label: "Review" },
  { id: "Build", icon: "🏗️", label: "Build" },
  { id: "Commits", icon: "⎇", label: "Commits" },
  { id: "Tools", icon: "🔧", label: "Tools" },
  { id: "Settings", icon: "⚙️", label: "Settings" }
] as const;

export default function MobileNav({ active, onChange }: { active: NavItem; onChange: (item: NavItem) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleMobileNav = (id: string) => {
    if (id === "Menu") {
      setSheetOpen(true);
      return;
    }
    onChange(id as NavItem);
    setSheetOpen(false);
  };

  return (
    <>
      {/* Bottom Nav Bar */}
      <aside
        className="fixed bottom-0 left-0 right-0 w-full flex justify-around items-center px-2 bg-bg border-t border-stroke z-40 shadow-2xl"
        style={{
          height: "80px",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <nav className="flex flex-row gap-0 flex-1 justify-around w-full items-center h-full">
          {mainNavItems.map((item) => {
            const isMenu = item.id === "Menu";
            const sheetIds = menuSheetItems.map(m => m.id as string);
            const isActive = isMenu ? sheetIds.includes(active) : active === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleMobileNav(item.id)}
                aria-label={item.label}
                className="flex flex-col items-center justify-center w-14 h-14 relative transition-all duration-200"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <span
                  className={`text-2xl transition-colors duration-200 ${isActive ? "text-white" : "text-muted hover:text-white"}`}
                >
                  {item.icon}
                </span>
                {isActive && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Slide-Up Sheet Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-[280ms] ${sheetOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSheetOpen(false)}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.8, 0.25, 1)" }}
      />

      {/* Slide-Up Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-bg border-t border-stroke rounded-t-3xl z-[70] px-4 pb-12 pt-3 transition-transform duration-[280ms] ${sheetOpen ? "translate-y-0" : "translate-y-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.8, 0.25, 1)" }}
      >
        <div className="w-12 h-1.5 bg-stroke rounded-full mx-auto mb-8" />

        <div className="grid grid-cols-3 gap-4">
          {menuSheetItems.map(item => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleMobileNav(item.id)}
                className={`flex flex-col items-center justify-center gap-3 p-4 rounded-2xl transition-all ${
                  isActive ? "bg-accent/20 text-white" : "bg-white/5 text-muted hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className={`text-[28px] leading-none ${isActive ? "text-accent drop-shadow-[0_0_8px_rgba(139,92,246,0.7)]" : ""}`}>{item.icon}</span>
                <span className={`text-xs font-semibold tracking-wide ${isActive ? "text-accent" : "text-muted"}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
