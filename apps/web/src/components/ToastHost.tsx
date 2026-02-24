import React from "react";
import { useToast } from "../lib/toast";

export default function ToastHost() {
  const { toasts, remove } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 grid gap-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
            toast.tone === "success"
              ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
              : toast.tone === "error"
              ? "border-red-300/30 bg-red-500/15 text-red-100"
              : toast.tone === "warning"
              ? "border-amber-300/30 bg-amber-500/15 text-amber-100"
              : "border-white/15 bg-black/70 text-white/80"
          }`}
          onClick={() => remove(toast.id)}
          aria-label="Dismiss notification"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
