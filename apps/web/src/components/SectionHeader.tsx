import React from "react";

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  rightControls
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightControls?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</p>}
        <h3 className="text-lg font-semibold leading-tight">{title}</h3>
        {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
      </div>
      {rightControls && <div className="flex flex-wrap items-center justify-end gap-2">{rightControls}</div>}
    </div>
  );
}
