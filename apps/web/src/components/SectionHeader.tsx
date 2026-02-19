import React from "react";

export default function SectionHeader({
  title,
  rightControls,
  subtitle
}: {
  title: string;
  rightControls?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{title}</p>
        {subtitle && <h3 className="text-base font-semibold">{subtitle}</h3>}
      </div>
      {rightControls && <div className="flex items-center gap-2">{rightControls}</div>}
    </div>
  );
}
