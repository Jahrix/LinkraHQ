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
    <div className="flex gap-2 border-b border-white/10">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`px-3 pb-2 text-sm transition ${
            active === tab ? "text-white border-b-2 border-white/60" : "text-white/50"
          }`}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
