import React from "react";

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  rightControls,
  size = "standard",
  className = "",
  titleClassName = ""
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightControls?: React.ReactNode;
  size?: "hero" | "standard" | "compact";
  className?: string;
  titleClassName?: string;
}) {
  const titleSize =
    size === "hero"
      ? "text-[clamp(1.8rem,3vw,2.5rem)] font-semibold tracking-[-0.04em]"
      : size === "compact"
      ? "text-base font-semibold tracking-[-0.02em]"
      : "text-xl font-semibold tracking-[-0.03em]";
  const subtitleClass = size === "hero" ? "text-sm text-white/62 md:text-[15px]" : "text-sm text-white/60";

  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}>
      <div className="space-y-1">
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">{eyebrow}</p>}
        <h3 className={`${titleSize} leading-tight ${titleClassName}`.trim()}>{title}</h3>
        {subtitle && <p className={subtitleClass}>{subtitle}</p>}
      </div>
      {rightControls && <div className="flex flex-wrap items-center justify-end gap-2">{rightControls}</div>}
    </div>
  );
}
