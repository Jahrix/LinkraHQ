import React from "react";

export default function GlassPanel({
  variant = "standard",
  className = "",
  as: Tag = "div",
  children
}: {
  variant?: "hero" | "standard" | "quiet" | "card";
  className?: string;
  as?: keyof JSX.IntrinsicElements;
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
  return <Tag className={`${base} ${className}`.trim()}>{children}</Tag>;
}
