import React from "react";

export default function StackedBar({
  segments
}: {
  segments: { color: string; value: number }[];
}) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10">
      {segments.map((seg, idx) => (
        <div
          key={`${seg.color}-${idx}`}
          style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
        />
      ))}
    </div>
  );
}
