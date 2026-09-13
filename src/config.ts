import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface CliConfig {
  deviceId: string;
  apiBaseUrl: string;
  deviceToken?: string;
  username?: string;
  timezone: string;
  lastSuccessfulSync?: string;
  syncedRecordHashes: string[];
  syncedRecordFingerprints?: Record<string, string>;
}

function defaults(): CliConfig {
  return {
    deviceId: randomUUID(),
    apiBaseUrl: process.env.TOKENLAWN_API_URL ?? "https://tokenlawn.dev",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    syncedRecordHashes: [],
  };
}

export function normalizeConfig(value: unknown): CliConfig {
  const fallback = defaults();
  if (!value || typeof value !== "object") return fallback;
  const stored = value as Partial<CliConfig>;
  return {
    deviceId: typeof stored.deviceId === "string" && stored.deviceId ? stored.deviceId : fallback.deviceId,
    apiBaseUrl: typeof stored.apiBaseUrl === "string" && stored.apiBaseUrl ? stored.apiBaseUrl : fallback.apiBaseUrl,
    timezone: typeof stored.timezone === "string" && stored.timezone ? stored.timezone : fallback.timezone,
    syncedRecordHashes: Array.isArray(stored.syncedRecordHashes) ? stored.syncedRecordHashes.filter((hash): hash is string => typeof hash === "string") : [],
    syncedRecordFingerprints: stored.syncedRecordFingerprints && typeof stored.syncedRecordFingerprints === "object"
      ? Object.fromEntries(Object.entries(stored.syncedRecordFingerprints).filter(([key, value]) => /^[a-f0-9]{64}$/.test(key) && typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) : {},
    ...(typeof stored.deviceToken === "string" && stored.deviceToken ? { deviceToken: stored.deviceToken } : {}),
    ...(typeof stored.username === "string" && stored.username ? { username: stored.username } : {}),
    ...(typeof stored.lastSuccessfulSync === "string" && stored.lastSuccessfulSync ? { lastSuccessfulSync: stored.lastSuccessfulSync } : {}),
  };
}

export function configPath(): string {
  const base = platform() === "win32" ? process.env.APPDATA ?? join(homedir(), "AppData", "Roaming") : process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "tokenlawn", "config.json");
}

export async function loadConfig(): Promise<CliConfig> {
  try { return normalizeConfig(JSON.parse(await readFile(configPath(), "utf8")) as unknown); }
  catch { return defaults(); }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  const path = configPath();
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  if (platform() !== "win32") await chmod(path, 0o600);
}

export async function logout(): Promise<void> {
  const config = await loadConfig();
  delete config.deviceToken; delete config.username; delete config.lastSuccessfulSync;
  config.deviceId = randomUUID();
  config.syncedRecordHashes = [];
  config.syncedRecordFingerprints = {};
  await saveConfig(config);
}
