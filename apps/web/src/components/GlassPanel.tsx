import React from "react";

export default function GlassPanel({
  variant = "standard",
  className = "",
  children
}: {
  variant?: "hero" | "standard" | "quiet" | "card";
  className?: string;
  children: React.ReactNode;
}) {
  const base =
    variant === "hero"
      ? "glass-hero"
      : variant === "quiet"
      ? "glass-quiet"
      : variant === "card"
      ? "card"
      : "glass-standard";
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}
