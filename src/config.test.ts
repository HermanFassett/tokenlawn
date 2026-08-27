import { describe, expect, it } from "vitest";
import { normalizeConfig } from "./config.js";

describe("normalizeConfig", () => {
  it("upgrades configs created before timezone and sync tracking were added", () => {
    const config = normalizeConfig({
      deviceId: "c43880de-22aa-4af6-95f5-6fc3d7b9885b",
      apiBaseUrl: "https://tokenlawn.dev",
      deviceToken: "secret-device-token",
      username: "herman",
    });

    expect(config).toMatchObject({
      deviceId: "c43880de-22aa-4af6-95f5-6fc3d7b9885b",
      apiBaseUrl: "https://tokenlawn.dev",
      deviceToken: "secret-device-token",
      username: "herman",
      syncedRecordHashes: [],
    });
    expect(config.timezone.length).toBeGreaterThan(0);
  });
});
