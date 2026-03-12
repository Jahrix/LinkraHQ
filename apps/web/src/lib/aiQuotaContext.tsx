import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

interface AiQuota {
  remaining: number;
  dailyLimit: number;
  used: number;
  isAdmin: boolean;
}

interface AiQuotaContextValue {
  quota: AiQuota;
  isLoading: boolean;
  setQuota: (q: AiQuota) => void;
}

const defaultQuota: AiQuota = { remaining: 10, dailyLimit: 10, used: 0, isAdmin: false };

const AiQuotaContext = createContext<AiQuotaContextValue>({
  quota: defaultQuota,
  isLoading: true,
  setQuota: () => {}
});

export function AiQuotaProvider({ children }: { children: React.ReactNode }) {
  const [quota, setQuota] = useState<AiQuota>(defaultQuota);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api.aiPlanQuota()
      .then((response) => {
        if (!cancelled) setQuota(response.quota);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <AiQuotaContext.Provider value={{ quota, isLoading, setQuota }}>
      {children}
    </AiQuotaContext.Provider>
  );
}

export function useAiQuota() {
  return useContext(AiQuotaContext);
}
