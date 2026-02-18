import React from "react";
import { useToast } from "../lib/toast";

export default function ToastHost() {
  const { toasts, remove } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" onClick={() => remove(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
