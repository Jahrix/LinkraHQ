import React from "react";

export default function TabBar({
  tabs,
  active,
  onChange
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div
      className="inline-flex w-full flex-wrap gap-2 rounded-[20px] border border-muted bg-white/[0.045] p-2"
      role="tablist"
      aria-label="Project sections"
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={active === tab}
          className={`rounded-2xl px-4 py-2 text-sm transition ${
            active === tab
              ? "bg-white/12 text-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              : "text-muted hover:bg-white/6 hover:text-strong"
          }`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
