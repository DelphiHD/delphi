// Core LLM invocation logic. Pure: no env reads, no Supabase writes, no
// filesystem access. Designed to be imported by both Node scripts (Phase 4
// iteration) and the Deno Edge Function (production).
//
// Cost ceiling enforcement: the model is asked once, the response is read, the
// cost is computed, and a hard 80-cent ceiling on a SINGLE call is enforced
// upstream by the caller. This module returns the cost; it does not abort.
// (Doing the check here would require the caller to handle the abort path
// anyway, and the caller has more context to decide what to do next.)

export type ModelId =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-opus-4-7"
  | "claude-sonnet-4-5"
  | "claude-haiku-3-5";

interface PriceTable {
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
}

// Anthropic pricing per million tokens, as of 2026-05-17. Update when prices
// change; the values exist here (not in env or a config file) so a cost
// regression shows up in git blame next to the responsible commit.
const PRICES: Record<ModelId, PriceTable> = {
  "claude-opus-4-7": {
    inputPerM: 15.0, outputPerM: 75.0, cacheWritePerM: 18.75, cacheReadPerM: 1.5,
  },
  "claude-sonnet-4-6": {
    inputPerM: 3.0, outputPerM: 15.0, cacheWritePerM: 3.75, cacheReadPerM: 0.3,
  },
  "claude-sonnet-4-5": {
    inputPerM: 3.0, outputPerM: 15.0, cacheWritePerM: 3.75, cacheReadPerM: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerM: 0.8, outputPerM: 4.0, cacheWritePerM: 1.0, cacheReadPerM: 0.08,
  },
  "claude-haiku-3-5": {
    inputPerM: 0.8, outputPerM: 4.0, cacheWritePerM: 1.0, cacheReadPerM: 0.08,
  },
};

export interface UsageRecord {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export function costInCents(model: ModelId, u: UsageRecord): number {
  const p = PRICES[model];
  if (!p) throw new Error(`unknown model for pricing: ${model}`);
  // Anthropic API: input_tokens is already the non-cached input. Cache write
  // and cache read are reported separately and are not subtracted from
  // input_tokens. The total input that hit the model is the sum of all three.
  const freshIn = u.input_tokens / 1_000_000;
  const wrote = u.cache_creation_input_tokens / 1_000_000;
  const read = u.cache_read_input_tokens / 1_000_000;
  const out = u.output_tokens / 1_000_000;
  const dollars =
    freshIn * p.inputPerM +
    wrote * p.cacheWritePerM +
    read * p.cacheReadPerM +
    out * p.outputPerM;
  return dollars * 100;
}

// A cached system block. Multiple blocks can be cached independently; the order
// matters (Anthropic computes the cache key on the prefix). Order them
// stable-first: library identity, then voice docs, then retrieved chunks.
export interface CachedBlock {
  // Short label used in logs (not sent to the API).
  name: string;
  text: string;
}

export interface InvokeArgs {
  model: ModelId;
  // Maximum tokens for the response.
  max_tokens: number;
  // The static system prompt (cached as one block).
  system: string;
  // Additional system blocks that are stable across many calls and worth
  // caching separately (e.g. retrieved chunks for a chart). Each becomes a
  // cache_control: ephemeral block.
  cache_blocks?: CachedBlock[];
  // User-side messages. Typically one message asking the model to generate.
  messages: { role: "user" | "assistant"; content: string }[];
  // Temperature; defaults to model-recommended (1 for Anthropic).
  temperature?: number;
}

export interface InvokeResult {
  text: string;
  usage: UsageRecord;
  cost_cents: number;
  model: ModelId;
}

export interface InvokeOptions {
  // The Anthropic API key. Required.
  apiKey: string;
  // Hard ceiling for a single call. If the computed cost exceeds this, the
  // result is still returned (we already paid for it) but a flag is set on
  // it so the caller can log the alert. Defaults to 80 cents per CLAUDE.md.
  hardCostCeilingCents?: number;
}

export class CostCeilingExceeded extends Error {
  constructor(public cents: number, public ceilingCents: number, public result: InvokeResult) {
    super(`cost ceiling exceeded: $${(cents / 100).toFixed(4)} > $${(ceilingCents / 100).toFixed(4)}`);
  }
}

export async function invokeLLM(args: InvokeArgs, opts: InvokeOptions): Promise<InvokeResult> {
  const apiKey = opts.apiKey;
  if (!apiKey) throw new Error("invokeLLM: apiKey is required");
  const ceiling = opts.hardCostCeilingCents ?? 80;

  // Build the system blocks. The static system prompt is the first cache block;
  // any cache_blocks follow.
  const systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];
  if (args.system) {
    systemBlocks.push({ type: "text", text: args.system, cache_control: { type: "ephemeral" } });
  }
  for (const cb of args.cache_blocks ?? []) {
    systemBlocks.push({ type: "text", text: cb.text, cache_control: { type: "ephemeral" } });
  }

  const body = {
    model: args.model,
    max_tokens: args.max_tokens,
    system: systemBlocks,
    messages: args.messages,
    temperature: args.temperature ?? 1,
  };

  // Direct fetch (no SDK) so this module runs in Deno Edge Functions and Node
  // alike. Anthropic occasionally drops long connections (ECONNRESET); retry
  // a couple of times with exponential backoff before giving up.
  let res: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      break;
    } catch (e) {
      lastError = e;
      // ECONNRESET, socket hang up, etc. Retry with backoff.
      if (attempt === 2) throw e;
      const waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  if (!res) throw lastError instanceof Error ? lastError : new Error("fetch failed");

  // 5xx or 429: retry as well.
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const waitMs = 3000 * Math.pow(2, attempt); // 3s, 6s
      await new Promise((r) => setTimeout(r, waitMs));
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok || (res.status !== 429 && res.status < 500)) break;
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text?: string }>;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string;
  };

  // Concatenate all text blocks (in normal use there is exactly one).
  const text = data.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text as string)
    .join("");

  const usage: UsageRecord = {
    input_tokens: data.usage.input_tokens,
    output_tokens: data.usage.output_tokens,
    cache_creation_input_tokens: data.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: data.usage.cache_read_input_tokens ?? 0,
  };

  const cents = costInCents(args.model, usage);

  const result: InvokeResult = {
    text,
    usage,
    cost_cents: Math.round(cents * 10000) / 10000, // keep 4 decimal places for $-fraction accounting
    model: args.model,
  };

  if (cents > ceiling) {
    throw new CostCeilingExceeded(cents, ceiling, result);
  }
  return result;
}
