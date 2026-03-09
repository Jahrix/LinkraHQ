import { claimAdminInvite } from "../_lib/supabaseQuota";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

function jsonResponse(status: number, payload: Record<string, unknown>, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

export async function onRequest(context: PagesContext) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "POST, OPTIONS",
        "cache-control": "no-store"
      }
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      405,
      { error: "Method not allowed. Use POST /api/admin/unlock." },
      { Allow: "POST, OPTIONS" }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const code = typeof (payload as { code?: unknown } | null)?.code === "string"
    ? (payload as { code: string }).code.trim()
    : "";

  if (!code) {
    return jsonResponse(400, { error: "Admin code is required." });
  }

  try {
    const quota = await claimAdminInvite(request, env, code);
    return jsonResponse(200, { quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unlock admin access.";
    const status = message === "Authentication required." ? 401 : 403;
    return jsonResponse(status, { error: message });
  }
}
