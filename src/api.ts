import type { CliConfig } from "./config.js";
import { deviceAuthorizationResponseSchema, deviceTokenResponseSchema, syncRequestSchema, syncResponseSchema, type SyncRequest, type UsageRecord } from "@tokenlawn/protocol";

async function request<T>(url: string, init: RequestInit, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : `Request failed (${response.status})`;
    const issues = typeof payload === "object" && payload && "issues" in payload && Array.isArray(payload.issues)
      ? payload.issues.flatMap((issue) => typeof issue === "object" && issue && "path" in issue && "message" in issue ? [`${String(issue.path)}: ${String(issue.message)}`] : []).join("; ")
      : "";
    throw new Error(issues ? `${message} (${issues})` : message);
  }
  return parse(payload);
}

export async function startDeviceAuthorization(config: CliConfig) {
  return request(`${config.apiBaseUrl}/api/v1/device/authorization`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: config.deviceId, platform: process.platform, arch: process.arch }) }, (value) => deviceAuthorizationResponseSchema.parse(value));
}

export async function pollDeviceToken(config: CliConfig, authorizationId: string) {
  return request(`${config.apiBaseUrl}/api/v1/device/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceAuthorizationId: authorizationId, deviceId: config.deviceId }) }, (value) => deviceTokenResponseSchema.parse(value));
}

export async function revokeDevice(config: CliConfig) {
  if (!config.deviceToken) return { revoked: false };
  return request(`${config.apiBaseUrl}/api/v1/device/revoke`, { method: "POST", headers: { authorization: `Bearer ${config.deviceToken}` } }, (value) => value as { revoked: boolean });
}

export async function syncBatch(config: CliConfig, records: UsageRecord[]) {
  if (!config.deviceToken) throw new Error("Run tokenlawn login first.");
  const body: SyncRequest = { protocolVersion: 1, deviceId: config.deviceId, batchId: crypto.randomUUID(), timezone: config.timezone, records };
  const validatedBody = syncRequestSchema.parse(body);
  return request(`${config.apiBaseUrl}/api/v1/sync`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.deviceToken}` }, body: JSON.stringify(validatedBody) }, (value) => syncResponseSchema.parse(value));
}

export async function verifyProvider(config: CliConfig, provider: string, credential: string) {
  if (!config.deviceToken) throw new Error("Run tokenlawn login first.");
  return request(`${config.apiBaseUrl}/api/v1/providers/${provider}/verify`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.deviceToken}`, "cache-control": "no-store" }, body: JSON.stringify({ credential }) }, (value) => value as { records: number; processedTokens: number; verifiedThrough: string });
}
