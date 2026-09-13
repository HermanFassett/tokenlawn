import { createHash } from "node:crypto";
import type { UsageRecord } from "@tokenlawn/protocol";

export function recordFingerprint(record: UsageRecord): string {
  return createHash("sha256").update(JSON.stringify([
    record.source, record.usageDate, record.model ?? null,
    record.inputUncachedTokens, record.inputCachedTokens, record.cacheWriteTokens,
    record.outputTokens, record.reasoningTokens ?? null, record.processedTokens,
    record.freshTokens, record.estimatedCostMicros ?? null,
  ])).digest("hex");
}
