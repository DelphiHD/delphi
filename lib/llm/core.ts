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

  // We use STREAMING (`stream: true`) for two reasons:
  // 1. Reliability — Anthropic's synchronous endpoint has been observed
  //    closing the HTTP connection on long-running generations (>15s) without
  //    delivering the response, while the streaming endpoint stays open and
  //    delivers content deltas immediately. The intermediate proxy layer
  //    handles streamed connections more robustly than ones blocked on a
  //    multi-minute compute.
  // 2. Long-output support — our planetary calls can generate 17K+ output
  //    tokens, which take 60-180s to compute. Streaming avoids any
  //    intermediate timeout. The final usage record arrives in a
  //    `message_delta` event at the end of the stream.
  // Shell out to `curl` for the API call.
  //
  // Why: Node 22's bundled undici drops the TCP connection mid-stream
  // (ECONNRESET) on long-running Anthropic streams from our local network
  // — both raw `fetch()` and the official Anthropic SDK (which uses
  // undici under the hood) fail the same way. curl's TLS stack and HTTP
  // implementation don't hit the issue. This sidesteps undici entirely
  // until that's resolved upstream.
  //
  // We use `stream: true` so the API responds with SSE — keeps the
  // connection productive throughout the multi-minute generation rather
  // than blocking on a single sync response that an intermediate proxy
  // can time out.
  const body = {
    model: args.model,
    max_tokens: args.max_tokens,
    system: systemBlocks,
    messages: args.messages,
    temperature: args.temperature ?? 1,
    stream: true,
  };
  const bodyJson = JSON.stringify(body);

  // Write the body to a temp file and have curl read from it. Piping
  // ~500KB through stdin into a child process hangs intermittently on
  // macOS — using a file path avoids the OS pipe-buffer dance entirely.
  const { spawn } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpBody = path.join(os.tmpdir(), `anthropic-body-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
  fs.writeFileSync(tmpBody, bodyJson);

  // Inner helper: one streaming attempt against the API. Returns the parsed
  // text + usage on success, or throws on any curl-level or stream-level
  // failure. We force HTTP/1.1 (--http1.1) because intermediate proxies
  // have been observed terminating HTTP/2 streams partway through the
  // multi-minute generation; HTTP/1.1 chunked transfer is more resilient.
  async function runOneAttempt(): Promise<{ text: string; usage: UsageRecord; stopReason?: string }> {
    const proc = spawn("curl", [
      "-s", "--no-buffer",
      "--http1.1",
      "-X", "POST",
      "--max-time", "1200",
      // Stall detection: if the byte rate drops below 100 B/s for 60s,
      // abort. A live Anthropic SSE stream emits far more than that; a
      // stalled one emits zero. Without this, a silent stream that keeps
      // TCP alive will eat the full 20-minute --max-time before failing,
      // turning a single bad attempt into a 20-80 minute hang (×4 retries).
      "--speed-limit", "100", "--speed-time", "60",
      "-H", `x-api-key: ${apiKey}`,
      "-H", "anthropic-version: 2023-06-01",
      "-H", "content-type: application/json",
      "--data-binary", `@${tmpBody}`,
      "https://api.anthropic.com/v1/messages",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let textOut = "";
    const usage: UsageRecord = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    let stopReason: string | undefined;
    let streamError: string | undefined;
    let buf = "";

    proc.stdout.setEncoding("utf8");
    let rawOut = "";
    for await (const chunk of proc.stdout as AsyncIterable<string>) {
      buf += chunk;
      rawOut += chunk;
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const dataLine = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const dataStr = dataLine.slice(5).trim();
        if (!dataStr) continue;
        let parsed: any;
        try { parsed = JSON.parse(dataStr); } catch { continue; }
        switch (parsed.type) {
          case "message_start": {
            const u = parsed.message?.usage;
            if (u) {
              usage.input_tokens = u.input_tokens ?? 0;
              usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
              usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
              usage.output_tokens = u.output_tokens ?? 0;
            }
            break;
          }
          case "content_block_delta": {
            const delta = parsed.delta;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              textOut += delta.text;
            }
            break;
          }
          case "message_delta": {
            if (parsed.usage?.output_tokens != null) {
              usage.output_tokens = parsed.usage.output_tokens;
            }
            if (parsed.delta?.stop_reason) {
              stopReason = parsed.delta.stop_reason;
            }
            break;
          }
          case "error": {
            streamError = JSON.stringify(parsed.error).slice(0, 500);
            break;
          }
        }
      }
    }

    let stderrBuf = "";
    proc.stderr.setEncoding("utf8");
    for await (const chunk of proc.stderr as AsyncIterable<string>) {
      stderrBuf += chunk;
    }
    const exitCode: number = await new Promise((resolve) => {
      proc.on("close", (code) => resolve(code ?? 0));
    });

    if (streamError) throw new Error(`Anthropic stream error: ${streamError}`);
    if (exitCode !== 0) throw new Error(`curl exited ${exitCode}: ${stderrBuf.slice(0, 500)}`);
    if (!textOut && !usage.output_tokens) {
      // A non-streaming error (invalid key, LOW CREDIT BALANCE, unknown model,
      // rate limit) comes back as a plain JSON error body, not SSE, so nothing
      // above parsed it. Surface the real message instead of "empty stream".
      try {
        const j = JSON.parse(rawOut.trim());
        if (j?.type === "error" && j.error?.message) throw new Error(`Anthropic API error: ${j.error.message}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Anthropic API error:")) throw e;
      }
      throw new Error(`Anthropic returned empty stream. curl stderr: ${stderrBuf.slice(0, 500)}`);
    }
    return { text: textOut, usage, stopReason };
  }

  // Retry loop: long streaming connections occasionally get cut by an
  // intermediate proxy partway through (curl exit 56 = recv error,
  // exit 28 = timeout, exit 18 = partial transfer). Re-running the
  // request from scratch is safe; the API hits the prompt cache on the
  // second attempt and is significantly cheaper than the first.
  let lastErr: unknown = null;
  let streamResult: { text: string; usage: UsageRecord; stopReason?: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      streamResult = await runOneAttempt();
      break;
    } catch (e) {
      lastErr = e;
      if (attempt === 3) break;
      const backoffMs = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  try { fs.unlinkSync(tmpBody); } catch { /* ignore */ }

  if (!streamResult) throw lastErr instanceof Error ? lastErr : new Error("invokeLLM: all retries failed");

  void streamResult.stopReason;
  const text = streamResult.text;
  const usage = streamResult.usage;

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
