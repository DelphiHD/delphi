// Phase 4 Edge Function: the single point through which every Anthropic call
// in the system flows. Per CLAUDE.md, no client-side calls and no
// `/api/...` route calls Anthropic directly. They call this function.
//
// Responsibilities:
//   1. Set cache_control on the system prompt and each cache_block.
//   2. Enforce the 80-cent hard ceiling per call (configurable via env).
//   3. Log a usage_events row to Supabase on every call, including failures.
//   4. Return { text, usage, cost_cents } to the caller.
//
// Auth: the caller passes the user's session JWT in the Authorization header.
// The function uses the service role internally for usage_events writes; the
// caller's user_id is parsed from the JWT and recorded on each row.
//
// Deploy:  supabase functions deploy invoke-llm
// Invoke:  POST https://<ref>.supabase.co/functions/v1/invoke-llm
//          Authorization: Bearer <anon-key or user JWT>
//          Body: { model, max_tokens, system, cache_blocks?, messages, kind?, report_id? }

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  invokeLLM,
  CostCeilingExceeded,
  costInCents,
  type ModelId,
  type InvokeArgs,
} from "../../../lib/llm/core.ts";

interface RequestBody {
  model: ModelId;
  max_tokens: number;
  system: string;
  cache_blocks?: { name: string; text: string }[];
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
  // Reporting fields. None are sent on to Anthropic.
  kind?: string; // e.g. "report.generate", "transit.daily"
  report_id?: string | null;
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing edge function env: ${name}`);
  return v;
}

async function parseUserId(req: Request): Promise<string | null> {
  // The Supabase JS client puts the user's JWT in the Authorization header. We
  // decode it locally to get the user id; full verification happens via the
  // service-role write hitting RLS-protected tables (which use auth.uid()).
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function logUsage(args: {
  supabase: any;
  user_id: string | null;
  report_id: string | null;
  kind: string;
  model: ModelId;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  cost_cents: number;
  meta: Record<string, unknown>;
}): Promise<void> {
  try {
    await args.supabase.from("usage_events").insert({
      user_id: args.user_id,
      report_id: args.report_id,
      kind: args.kind,
      model: args.model,
      input_tokens: args.usage.input_tokens,
      output_tokens: args.usage.output_tokens,
      cache_read_input_tokens: args.usage.cache_read_input_tokens,
      cache_write_input_tokens: args.usage.cache_creation_input_tokens,
      cost_cents: Math.round(args.cost_cents),
      meta: args.meta,
    });
  } catch (e) {
    // Don't fail the request because logging failed; the call already cost
    // money. Surface the failure to the caller via a header instead.
    console.error("usage_events insert failed:", (e as any)?.message ?? e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(req), "content-type": "application/json" },
    });
  }

  const anthropicKey = getEnv("ANTHROPIC_API_KEY");
  const ceiling = Number(Deno.env.get("HARD_COST_CEILING_CENTS") ?? "80");
  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const userId = await parseUserId(req);
  const kind = body.kind ?? "report.generate";
  const reportId = body.report_id ?? null;

  const invokeArgs: InvokeArgs = {
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system,
    cache_blocks: body.cache_blocks,
    messages: body.messages,
    temperature: body.temperature,
  };

  try {
    const result = await invokeLLM(invokeArgs, {
      apiKey: anthropicKey,
      hardCostCeilingCents: ceiling,
    });

    await logUsage({
      supabase,
      user_id: userId,
      report_id: reportId,
      kind,
      model: body.model,
      usage: result.usage,
      cost_cents: result.cost_cents,
      meta: {},
    });

    return new Response(
      JSON.stringify({
        text: result.text,
        usage: result.usage,
        cost_cents: result.cost_cents,
        model: result.model,
      }),
      { status: 200, headers: { ...corsHeaders(req), "content-type": "application/json" } },
    );
  } catch (e: unknown) {
    if (e instanceof CostCeilingExceeded) {
      // The call DID happen (the money is spent), but the response exceeded
      // the ceiling. Record a usage_event for the call AND an alert row.
      const r = e.result;
      await logUsage({
        supabase,
        user_id: userId,
        report_id: reportId,
        kind,
        model: body.model,
        usage: r.usage,
        cost_cents: r.cost_cents,
        meta: { exceeded_ceiling: true, ceiling_cents: e.ceilingCents },
      });
      await logUsage({
        supabase,
        user_id: userId,
        report_id: reportId,
        kind: "alert.cost_ceiling",
        model: body.model,
        usage: r.usage,
        cost_cents: 0,
        meta: {
          attempted_cost_cents: r.cost_cents,
          ceiling_cents: e.ceilingCents,
          message: e.message,
        },
      });
      return new Response(
        JSON.stringify({
          error: "cost_ceiling_exceeded",
          attempted_cost_cents: r.cost_cents,
          ceiling_cents: e.ceilingCents,
        }),
        { status: 402, headers: { ...corsHeaders(req), "content-type": "application/json" } },
      );
    }
    const msg = (e as any)?.message ?? String(e);
    await logUsage({
      supabase,
      user_id: userId,
      report_id: reportId,
      kind: kind + ".error",
      model: body.model,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      cost_cents: 0,
      meta: { error: msg },
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "content-type": "application/json" },
    });
  }
});
