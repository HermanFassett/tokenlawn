import { describe, expect, it, vi } from "vitest";
import { CcusageCollector, displaySource, rawFromRow, summarizeSources } from "./collector.js";
import { normalizeUsage } from "@tokenlawn/core";

describe("summarizeSources", () => {
  it("replaces undated Hermes sessions with stable daily model snapshots", async () => {
    const collector = new CcusageCollector();
    const day = { date: "2026-09-10", modelBreakdowns: [{ modelName: "test-model", inputTokens: 10, cacheReadTokens: 100, cacheCreationTokens: 5, outputTokens: 2, cost: 0.5 }] };
    const run = vi.spyOn(collector, "run").mockResolvedValueOnce([{ agent: "hermes", period: "session-1", inputTokens: 10 }]).mockResolvedValueOnce([day]);
    const first = await collector.collect({ timezone: "UTC" });
    expect(run).toHaveBeenLastCalledWith("UTC", undefined, "hermesDaily");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ source: "hermes", usageDate: "2026-09-10", processedTokens: 117, estimatedCostMicros: 500000 });
    run.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...day, date: "2026-09-09" }, { ...day, modelBreakdowns: [{ ...day.modelBreakdowns[0], inputTokens: 20 }] }]);
    const next = await collector.collect({ timezone: "UTC" });
    expect(next[1]?.sourceRecordHash).toBe(first[0]?.sourceRecordHash);
    expect(next[1]?.processedTokens).toBe(127);
  });
  it("assigns UTC timestamps to the configured local calendar day", async () => {
    const raw = rawFromRow({ agent: "codex", lastActivity: "2026-08-28T03:10:00.000Z" }, 0, "America/Los_Angeles");
    const record = await normalizeUsage(raw[0]!);
    expect(record.usageDate).toBe("2026-08-27");
    expect(rawFromRow({ agent: "codex", date: "2026-08-28" }, 0, "America/Los_Angeles")[0]?.date).toBe("2026-08-28");
  });

  it("aggregates records without content", () => {
    const base = { schemaVersion: 1 as const, sourceRecordHash: "a".repeat(64), usageDate: "2026-08-25", inputUncachedTokens: 10, inputCachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, processedTokens: 10, freshTokens: 10, provenance: "local_collected" as const };
    expect(summarizeSources([{ ...base, source: "codex" }, { ...base, source: "codex", sourceRecordHash: "b".repeat(64) }])[0]).toMatchObject({ id: "codex", records: 2, tokens: 20 });
  });
  it("maps ccusage v20 session rows without subtracting cache reads", async () => {
    const raw = rawFromRow({ agent: "codex", inputTokens: 590443, cacheReadTokens: 21080064, outputTokens: 57844,
      period: "rollout-session", metadata: { lastActivity: "2026-08-07T23:28:04Z" },
      modelBreakdowns: [{ modelName: "gpt-5.6-sol", inputTokens: 590443, cacheReadTokens: 21080064, cacheCreationTokens: 0, outputTokens: 57844, cost: 15.22 }] }, 0);
    expect(raw).toHaveLength(1);
    const record = await normalizeUsage(raw[0]!);
    expect(record).toMatchObject({ usageDate: "2026-08-07", inputUncachedTokens: 590443, inputCachedTokens: 21080064, processedTokens: 21728351, model: "gpt-5.6-sol" });
  });
  it("labels Grok Build usage", () => {
    expect(displaySource("grok")).toBe("Grok Build CLI");
  });
});
