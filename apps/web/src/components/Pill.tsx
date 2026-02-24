import React from "react";

export default function Pill({
  children,
  tone = "neutral",
  className = ""
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "pill-success"
      : tone === "warning"
      ? "pill-warning"
      : tone === "danger"
      ? "pill-danger"
      : tone === "accent"
      ? "pill-accent"
      : "pill-neutral";

  return <span className={`pill ${toneClass} ${className}`.trim()}>{children}</span>;
}
