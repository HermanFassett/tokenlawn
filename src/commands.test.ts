import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageRecord } from "@tokenlawn/protocol";
import type { CliConfig } from "./config.js";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(), loadConfig: vi.fn(), saveConfig: vi.fn(), syncBatch: vi.fn(),
  startDeviceAuthorization: vi.fn(), pollDeviceToken: vi.fn(), open: vi.fn(),
}));

vi.mock("./collector.js", () => ({
  CcusageCollector: class { collect = mocks.collect; },
  summarizeSources: () => [],
}));
vi.mock("./config.js", () => ({
  loadConfig: mocks.loadConfig, saveConfig: mocks.saveConfig, logout: vi.fn(), configPath: () => "/config.json",
}));
vi.mock("./api.js", () => ({
  syncBatch: mocks.syncBatch, startDeviceAuthorization: mocks.startDeviceAuthorization,
  pollDeviceToken: mocks.pollDeviceToken, revokeDevice: vi.fn(), verifyProvider: vi.fn(),
}));
vi.mock("@tokenlawn/renderer", () => ({ renderAnsi: () => "lawn", renderLawnSvg: () => "<svg/>" }));
vi.mock("open", () => ({ default: mocks.open }));

import { publish, status } from "./commands.js";

const record = (index: number): UsageRecord => ({
  schemaVersion: 1, source: "codex", sourceRecordHash: index.toString(16).padStart(64, "0"), usageDate: "2026-09-11",
  inputUncachedTokens: 1, inputCachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1,
  processedTokens: 2, freshTokens: 2, provenance: "local_collected",
});

function config(overrides: Partial<CliConfig> = {}): CliConfig {
  return { deviceId: "c43880de-22aa-4af6-95f5-6fc3d7b9885b", apiBaseUrl: "https://tokenlawn.dev", timezone: "UTC", syncedRecordHashes: [], ...overrides };
}

describe("publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mocks.open.mockResolvedValue(undefined);
    mocks.syncBatch.mockResolvedValue({ accepted: 0, duplicates: 0, rejected: 0, statsVersion: 1 });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("collects once, skips tracked records, batches pending records, and updates tracking", async () => {
    const records = Array.from({ length: 1002 }, (_, index) => record(index));
    const stored = config({ deviceToken: "token", username: "herman", syncedRecordHashes: records.slice(0, 2).map((item) => item.sourceRecordHash) });
    mocks.loadConfig.mockResolvedValue(stored);
    mocks.collect.mockResolvedValue(records);
    mocks.syncBatch.mockResolvedValue({ accepted: 500, duplicates: 0, rejected: 0, statsVersion: 1 });

    await publish();

    expect(mocks.collect).toHaveBeenCalledOnce();
    expect(mocks.collect).toHaveBeenCalledWith({ timezone: "UTC" });
    expect(mocks.syncBatch).toHaveBeenCalledTimes(2);
    expect(mocks.syncBatch.mock.calls[0]?.[1]).toHaveLength(500);
    expect(mocks.syncBatch.mock.calls[1]?.[1]).toHaveLength(500);
    expect(mocks.syncBatch.mock.calls.flatMap((call) => call[1] as UsageRecord[])).not.toContain(records[0]);
    expect(stored.syncedRecordHashes).toHaveLength(1002);
    expect(stored.lastSuccessfulSync).toBeTruthy();
    expect(mocks.saveConfig).toHaveBeenCalledWith(stored);
  });

  it("reconciles every record with --full, including locally tracked hashes", async () => {
    const records = [record(1), record(2), record(3)];
    const stored = config({ deviceToken: "token", username: "herman", syncedRecordHashes: records.map((item) => item.sourceRecordHash) });
    mocks.loadConfig.mockResolvedValue(stored);
    mocks.collect.mockResolvedValue(records);
    mocks.syncBatch.mockResolvedValue({ accepted: 0, duplicates: 3, rejected: 0, statsVersion: 1 });

    await publish({ full: true });

    expect(mocks.collect).toHaveBeenCalledOnce();
    expect(mocks.syncBatch).toHaveBeenCalledOnce();
    expect(mocks.syncBatch.mock.calls[0]?.[1]).toEqual(records);
    expect(stored.syncedRecordHashes).toEqual(records.map((item) => item.sourceRecordHash));
  });

  it("automatically signs in before uploading", async () => {
    vi.useFakeTimers();
    const stored = config();
    mocks.loadConfig.mockResolvedValue(stored);
    mocks.collect.mockResolvedValue([record(1)]);
    mocks.startDeviceAuthorization.mockResolvedValue({
      deviceAuthorizationId: "8d7141ef-f2b1-4e7a-bbe0-c4bd00ad419f", userCode: "LAWN-12345678",
      verificationUri: "https://tokenlawn.dev/device", expiresAt: "2099-01-01T00:00:00.000Z", interval: 2,
    });
    mocks.pollDeviceToken.mockResolvedValue({ status: "approved", token: "x".repeat(32), username: "herman", deviceId: stored.deviceId });

    const result = publish();
    await vi.runAllTimersAsync();
    await result;

    expect(mocks.startDeviceAuthorization).toHaveBeenCalledOnce();
    expect(mocks.pollDeviceToken).toHaveBeenCalledOnce();
    expect(mocks.syncBatch).toHaveBeenCalledOnce();
    expect(stored.deviceToken).toBe("x".repeat(32));
  });
});

describe("status", () => {
  it("uses publish terminology for the last successful timestamp", async () => {
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    mocks.loadConfig.mockResolvedValue(config({ lastSuccessfulSync: "2026-09-11T12:00:00.000Z" }));
    await status();
    expect(output).toHaveBeenCalledWith(expect.stringContaining("Last published: 2026-09-11T12:00:00.000Z"));
    output.mockRestore();
  });
});
