export interface AiPlanQuotaStatus {
  isAdmin: boolean;
  used: number;
  dailyLimit: number;
  remaining: number;
}

const DEFAULT_DAILY_LIMIT = 10;

interface SupabaseEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

function getSupabaseConfig(env: SupabaseEnv) {
  const url = env.SUPABASE_URL || "";
  const anonKey = env.SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) {
    throw new Error("Supabase quota/admin access is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.");
  }
  return { url, anonKey };
}

function getAuthHeader(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Authentication required.");
  }
  return header;
}

async function callRpc<T>(
  request: Request,
  env: SupabaseEnv,
  rpcName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig(env);
  const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: getAuthHeader(request)
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : typeof (payload as any)?.message === "string"
        ? (payload as any).message
        : typeof (payload as any)?.error === "string"
        ? (payload as any).error
        : "Supabase RPC request failed.";
    throw new Error(message);
  }

  return payload as T;
}

function normalizeStatus(payload: unknown): AiPlanQuotaStatus {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const isAdmin = Boolean((row as any)?.is_admin ?? (row as any)?.isAdmin);
  const used = Math.max(0, Number((row as any)?.used) || 0);
  const dailyLimit = Math.max(1, Number((row as any)?.daily_limit ?? (row as any)?.dailyLimit) || DEFAULT_DAILY_LIMIT);
  const remaining = Math.max(0, Number((row as any)?.remaining) || Math.max(0, dailyLimit - used));
  return { isAdmin, used, dailyLimit, remaining };
}

export async function fetchAiPlanQuotaStatus(request: Request, env: SupabaseEnv) {
  const result = await callRpc<unknown>(request, env, "linkra_get_ai_plan_status", {
    p_daily_limit: DEFAULT_DAILY_LIMIT
  });
  return normalizeStatus(result);
}

export async function consumeAiPlanQuota(request: Request, env: SupabaseEnv) {
  const result = await callRpc<unknown>(request, env, "linkra_consume_ai_plan_quota", {
    p_daily_limit: DEFAULT_DAILY_LIMIT
  });
  return normalizeStatus(result);
}

export async function claimAdminInvite(request: Request, env: SupabaseEnv, code: string) {
  const result = await callRpc<unknown>(request, env, "linkra_claim_admin_invite", {
    p_code: code,
    p_daily_limit: DEFAULT_DAILY_LIMIT
  });
  return normalizeStatus(result);
}
