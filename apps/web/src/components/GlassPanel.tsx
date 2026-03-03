import React from "react";

type GlassPanelProps<Tag extends React.ElementType> = {
  variant?: "hero" | "standard" | "quiet" | "card";
  className?: string;
  as?: Tag;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<Tag>, "children" | "className" | "as">;

export default function GlassPanel<Tag extends React.ElementType = "div">({
  variant = "standard",
  className = "",
  as,
  children,
  ...rest
}: GlassPanelProps<Tag>) {
  const TagName = (as ?? "div") as React.ElementType;
  const variantClass =
    variant === "hero"
      ? "glass-hero"
      : variant === "quiet"
      ? "glass-quiet"
      : variant === "card"
      ? "card"
      : "glass-standard";
  const baseClass = variant === "card" ? "" : "glass-panel";

  return React.createElement(
    TagName,
    {
      className: `${baseClass} ${variantClass} ${className}`.trim(),
      ...rest
    },
    children
  );
}
