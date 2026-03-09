import { AppStateSchema, createBuildPlanPrompt, parseBuildPlanResponse } from "../../../packages/shared/src/index.js";

interface Env {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: {
    type?: string;
    message?: string;
  };
}

const DEFAULT_ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-20250514"
];

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

async function requestAnthropicPlan(apiKey: string, model: string, systemPrompt: string, userMessage: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });

  const payload = (await response.json()) as AnthropicMessageResponse;

  if (!response.ok) {
    const error = new Error(payload.error?.message || `Anthropic request failed with ${response.status}`);
    Object.assign(error, { type: payload.error?.type, status: response.status });
    throw error;
  }

  const rawText = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");

  return rawText;
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
      { error: "Method not allowed. Use POST /api/ai/build-plan." },
      { Allow: "POST, OPTIONS" }
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse(503, {
      error: "AI planning is not configured. Add ANTHROPIC_API_KEY to Cloudflare Pages for Build My Plan."
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const parsedState = AppStateSchema.safeParse((payload as { state?: unknown } | null)?.state);
  if (!parsedState.success) {
    return jsonResponse(400, { error: "state is required and must be valid" });
  }

  const prompt = typeof (payload as { prompt?: unknown } | null)?.prompt === "string"
    ? (payload as { prompt: string }).prompt
    : "";
  const { tasks, systemPrompt, userMessage } = createBuildPlanPrompt(parsedState.data, prompt);

  if (tasks.length === 0) {
    return jsonResponse(400, {
      error: "No open tasks available to build a plan from."
    });
  }

  const models = [env.ANTHROPIC_MODEL, ...DEFAULT_ANTHROPIC_MODELS].filter(
    (model, index, values): model is string => Boolean(model) && values.indexOf(model) === index
  );

  let rawText = "";
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      rawText = await requestAnthropicPlan(env.ANTHROPIC_API_KEY, model, systemPrompt, userMessage);
      lastError = null;
      break;
    } catch (error) {
      const modelError = error instanceof Error ? error : new Error("Anthropic request failed");
      lastError = modelError;
      if ((modelError as Error & { type?: string }).type !== "not_found_error") {
        break;
      }
    }
  }

  if (!rawText) {
    return jsonResponse(500, {
      error: lastError?.message || "No Anthropic model is available for Build My Plan."
    });
  }

  try {
    const plan = parseBuildPlanResponse(rawText, tasks.map((task) => task.id));
    return jsonResponse(200, plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate plan";
    return jsonResponse(500, { error: message });
  }
}
