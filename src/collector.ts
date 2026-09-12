import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { homedir, hostname } from "node:os";
import { resolve } from "node:path";
import { normalizeUsage, type RawUsage } from "@tokenlawn/core";
import type { UsageRecord } from "@tokenlawn/protocol";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export interface DetectedSource { id: string; name: string; records: number; tokens: number }
export interface Collection { records: UsageRecord[]; sources: DetectedSource[] }
export interface UsageCollector { detect(): Promise<DetectedSource[]>; collect(options: { timezone: string; since?: string }): Promise<UsageRecord[]> }

type Json = Record<string, unknown>;
const number = (row: Json, ...keys: string[]) => {
  for (const key of keys) { const value = row[key]; if (typeof value === "number" && Number.isFinite(value)) return value; }
  return 0;
};
const string = (row: Json, ...keys: string[]) => {
  for (const key of keys) { const value = row[key]; if (typeof value === "string" && value) return value; }
  return undefined;
};

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
function dateInTimezone(value: string, timeZone: string): string {
  if (dateOnly.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>;
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : value.slice(0, 10);
}

function flattenRows(payload: unknown): Json[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Json => !!item && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Json;
  for (const key of ["data", "daily", "session", "sessions", "rows", "reports"]) {
    const value = root[key];
    if (Array.isArray(value)) return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Json;
      const nested = record.data;
      return Array.isArray(nested) ? nested.filter((v): v is Json => !!v && typeof v === "object").map((v) => ({ ...v, agent: v.agent ?? record.agent ?? record.source })) : [record];
    });
  }
  return [];
}

export function rawFromRow(row: Json, index: number, timeZone = "UTC"): RawUsage[] {
  const source = string(row, "agent", "source", "provider", "tool") ?? "unknown";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Json : {};
  const rawDate = string(row, "date", "usageDate", "lastActivity", "timestamp") ?? string(metadata, "lastActivity", "timestamp");
  const date = rawDate ? dateInTimezone(rawDate, timeZone) : undefined;
  if (!date) return [];
  const sessionId = string(row, "period", "sessionId", "session_id", "id") ?? `${source}:${date}:${index}`;
  if (Array.isArray(row.modelBreakdowns) && row.modelBreakdowns.length) {
    return row.modelBreakdowns.filter((value): value is Json => !!value && typeof value === "object").map((breakdown, breakdownIndex) => {
      const model = string(breakdown, "modelName", "model") ?? `unknown-${breakdownIndex}`;
      return { source, stableId: `${sessionId}:${model}`, date, model,
        inputUncachedTokens: number(breakdown, "inputTokens", "input_tokens"),
        cachedInputTokens: number(breakdown, "cacheReadTokens", "cachedInputTokens"),
        cacheCreationTokens: number(breakdown, "cacheCreationTokens", "cacheWriteTokens"),
        outputTokens: number(breakdown, "outputTokens", "output_tokens"),
        costUsd: number(breakdown, "cost", "costUSD", "totalCost") };
    });
  }
  const input = number(row, "inputTokens", "input_tokens", "input");
  const cached = number(row, "cacheReadTokens", "cachedInputTokens", "cached_input_tokens", "cache_read_input_tokens");
  const cacheWrite = number(row, "cacheCreationTokens", "cacheWriteTokens", "cache_creation_input_tokens");
  const output = number(row, "outputTokens", "output_tokens", "output");
  const model = string(row, "model", "modelName");
  const stableId = `${sessionId}:${model ?? "all"}`;
  return [{ source, stableId, date, ...(model ? { model } : {}), inputUncachedTokens: input, cachedInputTokens: cached, cacheCreationTokens: cacheWrite, outputTokens: output, costUsd: number(row, "costUSD", "totalCost", "cost") }];
}

export class CcusageCollector implements UsageCollector {
  async run(timezone: string, since?: string, report: "sessions" | "hermesDaily" = "sessions"): Promise<Json[]> {
    const binPackage = require.resolve("ccusage/package.json");
    const packageRoot = binPackage.replace(/[\\/]package\.json$/, "");
    const manifest = require(binPackage) as { bin: string | Record<string, string> };
    const relativeBin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin.ccusage ?? Object.values(manifest.bin)[0];
    if (!relativeBin) throw new Error("The pinned ccusage package does not expose a CLI binary.");
    const command = report === "hermesDaily" ? ["hermes", "daily"] : ["session", "--all"];
    const args = [joinPath(packageRoot, relativeBin), ...command, "--json", "--offline", "--timezone", timezone];
    if (since) args.push("--since", since.replaceAll("-", ""));
    const { stdout } = await execute(process.execPath, args, { maxBuffer: 100 * 1024 * 1024, windowsHide: true, env: { ...process.env, NO_COLOR: "1", LOG_LEVEL: "0" } });
    return flattenRows(JSON.parse(stdout));
  }
  async collect(options: { timezone: string; since?: string }): Promise<UsageRecord[]> {
    const rows = await this.run(options.timezone, options.since);
    // v20 Hermes session reports omit dates. Use dated daily snapshots instead.
    const daily = await this.run(options.timezone, options.since, "hermesDaily");
    const roots = (process.env.HERMES_HOME ?? joinPath(homedir(), ".hermes")).split(",").map((root) => resolve(root.trim())).sort();
    const scope = JSON.stringify([hostname(), roots]);
    const raw = rows.filter((row) => string(row, "agent", "source", "provider", "tool") !== "hermes")
      .flatMap((row, index) => rawFromRow(row, index, options.timezone));
    raw.push(...daily.flatMap((row, index) => rawFromRow({ ...row, agent: "hermes", period: `hermes-daily-v1:${scope}:${string(row, "date")}` }, index, options.timezone)));
    return Promise.all(raw.map(normalizeUsage));
  }
  async detect(): Promise<DetectedSource[]> {
    const records = await this.collect({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
    return summarizeSources(records);
  }
}

const joinPath = (...parts: string[]) => parts.join(process.platform === "win32" ? "\\" : "/");

export function summarizeSources(records: UsageRecord[]): DetectedSource[] {
  const sources = new Map<string, DetectedSource>();
  for (const record of records) {
    const current = sources.get(record.source) ?? { id: record.source, name: displaySource(record.source), records: 0, tokens: 0 };
    current.records++; current.tokens += record.processedTokens; sources.set(record.source, current);
  }
  return [...sources.values()].sort((a, b) => b.tokens - a.tokens);
}

export const displaySource = (source: string) => ({ claude: "Claude Code", codex: "Codex", opencode: "OpenCode", hermes: "Hermes", gemini: "Gemini CLI", copilot: "Copilot CLI", grok: "Grok Build CLI" })[source] ?? source.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
