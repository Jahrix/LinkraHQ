import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface Toast {
  id: string;
  message: string;
  tone: "success" | "error" | "info" | "warning";
}

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"]) => void;
  remove: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIdsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutIdsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      timeoutIdsRef.current.clear();
    };
  }, []);

  const remove = useCallback((id: string) => {
    const timeoutId = timeoutIdsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
    const timeoutId = setTimeout(() => {
      timeoutIdsRef.current.delete(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
    timeoutIdsRef.current.set(id, timeoutId);
  }, []);

  const value = useMemo(() => ({ toasts, push, remove }), [toasts, push, remove]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
