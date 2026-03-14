import type express from "express";

export interface AiPlanQuotaStatus {
  isAdmin: boolean;
  used: number;
  dailyLimit: number;
  remaining: number;
}

const DEFAULT_DAILY_LIMIT = 10;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) {
    throw new Error(
      "Supabase quota/admin access is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY, or reuse VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY locally."
    );
  }
  return { url, anonKey };
}

function getAuthHeader(req: express.Request) {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Authentication required.");
  }
  return header;
}

async function callRpc<T>(
  req: express.Request,
  rpcName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: getAuthHeader(req)
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
        ? payload.error
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

export async function fetchAiPlanQuotaStatus(req: express.Request) {
  const result = await callRpc<unknown>(req, "linkra_get_ai_plan_status", {
    p_daily_limit: DEFAULT_DAILY_LIMIT
  });
  return normalizeStatus(result);
}

export async function consumeAiPlanQuota(req: express.Request) {
  const result = await callRpc<unknown>(req, "linkra_consume_ai_plan_quota", {
    p_daily_limit: DEFAULT_DAILY_LIMIT
  });
  return normalizeStatus(result);
}

export interface AgentQuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  reset_in_minutes: number;
}

function normalizeAgentQuota(payload: unknown): AgentQuotaResult {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return {
    allowed: Boolean((row as any)?.allowed),
    used: Number((row as any)?.used) || 0,
    limit: Number((row as any)?.limit) || 15,
    reset_in_minutes: Number((row as any)?.reset_in_minutes) || 0
  };
}

export async function checkAgentQuota(req: express.Request): Promise<AgentQuotaResult> {
  const result = await callRpc<unknown>(req, "linkra_check_agent_quota");
  return normalizeAgentQuota(result);
}

export async function getAgentQuotaStatus(req: express.Request): Promise<AgentQuotaResult> {
  const result = await callRpc<unknown>(req, "linkra_get_agent_quota_status");
  return normalizeAgentQuota(result);
}

export async function readSupabaseAppState(req: express.Request): Promise<unknown> {
  return callRpc<unknown>(req, "get_complete_app_state");
}

export async function writeSupabaseAppState(req: express.Request, state: unknown): Promise<void> {
  await callRpc<unknown>(req, "sync_app_state", { state_json: state });
}

// ── Conversation helpers ───────────────────────────────────────────────────

export interface AgentConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface AgentMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  action_taken: string | null;
  created_at: string;
}

export function getUserIdFromToken(req: express.Request): string {
  const header = req.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
  if (!payload.sub) throw new Error("JWT missing sub claim");
  return payload.sub as string;
}

export async function supabaseRest<T>(
  req: express.Request,
  path: string,
  method: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apikey: anonKey,
      Authorization: getAuthHeader(req),
      Prefer: "return=representation",
      ...extraHeaders
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message =
      typeof payload === "string" ? payload :
      typeof (payload as any)?.message === "string" ? (payload as any).message :
      typeof (payload as any)?.error === "string" ? (payload as any).error :
      "Supabase REST request failed.";
    throw new Error(message);
  }
  return payload as T;
}

export async function createAgentConversation(req: express.Request, title = "New conversation"): Promise<AgentConversationRow> {
  const userId = getUserIdFromToken(req);
  const rows = await supabaseRest<AgentConversationRow[]>(
    req, "agent_conversations", "POST", { user_id: userId, title }
  );
  return rows[0];
}

export async function updateConversationTitle(req: express.Request, id: string, title: string): Promise<void> {
  await supabaseRest<unknown>(
    req, `agent_conversations?id=eq.${id}`, "PATCH", { title }
  );
}

export async function touchConversation(req: express.Request, id: string): Promise<void> {
  await supabaseRest<unknown>(
    req, `agent_conversations?id=eq.${id}`, "PATCH", { updated_at: new Date().toISOString() }
  );
}

export async function insertAgentMessages(
  req: express.Request,
  rows: Array<{ conversation_id: string; user_id: string; role: "user" | "assistant"; content: string; action_taken: string | null }>
): Promise<AgentMessageRow[]> {
  return supabaseRest<AgentMessageRow[]>(req, "agent_messages", "POST", rows);
}

export async function listAgentConversations(req: express.Request): Promise<AgentConversationRow[]> {
  const result = await callRpc<unknown>(req, "linkra_get_agent_conversations");
  return (Array.isArray(result) ? result : []) as AgentConversationRow[];
}

export async function getAgentConversationMessages(req: express.Request, conversationId: string): Promise<AgentMessageRow[]> {
  const rows = await supabaseRest<AgentMessageRow[]>(
    req,
    `agent_messages?conversation_id=eq.${conversationId}&order=created_at.asc`,
    "GET"
  );
  return Array.isArray(rows) ? rows : [];
}

export async function verifyConversationOwner(req: express.Request, conversationId: string): Promise<boolean> {
  const rows = await supabaseRest<AgentConversationRow[]>(
    req,
    `agent_conversations?id=eq.${conversationId}&select=id`,
    "GET"
  );
  return Array.isArray(rows) && rows.length > 0;
}

export async function deleteAgentConversation(req: express.Request, conversationId: string): Promise<void> {
  await supabaseRest<unknown>(
    req, `agent_conversations?id=eq.${conversationId}`, "DELETE", undefined
  );
}
