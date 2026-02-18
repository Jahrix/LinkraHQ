import React from "react";
import { useToast } from "../lib/toast";

export default function ToastHost() {
  const { toasts, remove } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 grid gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm text-white/80"
          onClick={() => remove(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
