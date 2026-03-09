import { fetchAiPlanQuotaStatus } from "../_lib/supabaseQuota";

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
      { error: "Method not allowed. Use POST /api/ai/build-plan/quota." },
      { Allow: "POST, OPTIONS" }
    );
  }

  try {
    const quota = await fetchAiPlanQuotaStatus(request, env);
    return jsonResponse(200, { quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI plan quota.";
    const status = message === "Authentication required." ? 401 : 503;
    return jsonResponse(status, { error: message });
  }
}
