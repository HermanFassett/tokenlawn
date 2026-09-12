import { writeFile } from "node:fs/promises";
import open from "open";
import pc from "picocolors";
import { buildLawn, calculateStats, formatTokens } from "@tokenlawn/core";
import { renderAnsi, renderLawnSvg } from "@tokenlawn/renderer";
import type { UsageRecord } from "@tokenlawn/protocol";
import { CcusageCollector, summarizeSources } from "./collector.js";
import { loadConfig, logout as clearLogin, saveConfig, configPath } from "./config.js";
import { pollDeviceToken, revokeDevice, startDeviceAuthorization, syncBatch, verifyProvider } from "./api.js";
import { promptSecret } from "./secret-prompt.js";

const collector = new CcusageCollector();
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function showLawn(records: UsageRecord[], options: { svg?: string; json?: boolean } = {}): Promise<void> {
  const stats = calculateStats(records), lawn = buildLawn(stats.daily);
  if (options.json) process.stdout.write(`${JSON.stringify({ records, stats: { ...stats, daily: Object.fromEntries(stats.daily), bySource: Object.fromEntries(stats.bySource), byModel: Object.fromEntries(stats.byModel) } }, null, 2)}\n`);
  else {
    process.stdout.write(`\n${pc.bold(pc.green("YOUR TOKENLAWN"))}\n\n${renderAnsi(lawn)}\n\n${pc.bold(formatTokens(stats.processedTokens))} tokens processed\n${stats.activeDays} active days · ${stats.longestStreak}-day longest streak · ${formatTokens(stats.biggestDayTokens)} biggest day\n\n`);
    for (const source of summarizeSources(records)) process.stdout.write(`${pc.green("✓")} ${source.name.padEnd(18)} ${formatTokens(source.tokens).padStart(8)}\n`);
    process.stdout.write(`\n${pc.dim("Your conversations stay on this computer. Local scans do not send data to TokenLawn.")}\n`);
  }
  if (options.svg) { await writeFile(options.svg, renderLawnSvg(lawn, { title: "MY TOKENLAWN", subtitle: `${formatTokens(stats.processedTokens)} tokens processed` }), "utf8"); process.stderr.write(`${pc.green("✓")} Wrote ${options.svg}\n`); }
}

export async function scan(options: { svg?: string; json?: boolean } = {}): Promise<UsageRecord[]> {
  const config = await loadConfig();
  process.stderr.write(pc.dim("Reading local coding history…\n"));
  const records = await collector.collect({ timezone: config.timezone });
  await showLawn(records, options);
  return records;
}

export async function login(): Promise<void> {
  const config = await loadConfig();
  if (config.deviceToken) { process.stdout.write(`Signed in as @${config.username ?? "unknown"}. Run tokenlawn logout first to switch accounts.\n`); return; }
  const authorization = await startDeviceAuthorization(config);
  process.stdout.write(`\nOpen:\n${pc.cyan(authorization.verificationUri)}\n\nCode:\n${pc.bold(authorization.userCode)}\n\n`);
  await open(authorization.verificationUri).catch(() => undefined);
  process.stdout.write(pc.dim("Waiting for you to connect this computer in your browser…\n"));
  let interval = authorization.interval;
  while (new Date(authorization.expiresAt) > new Date()) {
    await sleep(interval * 1000);
    const result = await pollDeviceToken(config, authorization.deviceAuthorizationId);
    if (result.status === "approved") { config.deviceToken = result.token; config.username = result.username; config.deviceId = result.deviceId; await saveConfig(config); process.stdout.write(`${pc.green("✓")} Signed in as @${result.username}\n`); return; }
    if (result.status === "expired") break;
    if (result.status === "slow_down") interval = result.interval;
  }
  throw new Error("The device code expired. Run tokenlawn login to try again.");
}

async function upload(records: UsageRecord[], options: { full?: boolean } = {}): Promise<void> {
  const config = await loadConfig();
  if (!config.deviceToken) await login();
  const authenticated = await loadConfig();
  const known = new Set(options.full ? [] : authenticated.syncedRecordHashes);
  const pending = records.filter((record) => !known.has(record.sourceRecordHash));
  let accepted = 0, duplicates = 0;
  for (let index = 0; index < pending.length; index += 500) {
    const batch = pending.slice(index, index + 500);
    const result = await syncBatch(authenticated, batch);
    accepted += result.accepted; duplicates += result.duplicates;
    batch.forEach((record) => known.add(record.sourceRecordHash));
    process.stderr.write(`Published ${Math.min(index + batch.length, pending.length)}/${pending.length}\r`);
  }
  authenticated.lastSuccessfulSync = new Date().toISOString(); authenticated.syncedRecordHashes = [...known].slice(-50_000); await saveConfig(authenticated);
  process.stdout.write(`\n${pc.green("✓")} ${accepted} new · ${duplicates} already published\nYour profile: ${authenticated.apiBaseUrl}/${authenticated.username}\n`);
}

export async function publish(options: { full?: boolean } = {}): Promise<void> {
  const config = await loadConfig();
  process.stderr.write(pc.dim("Reading local coding history…\n"));
  const records = await collector.collect({ timezone: config.timezone });
  await showLawn(records);
  await upload(records, options);
}
export async function status(): Promise<void> { const config = await loadConfig(); process.stdout.write(`${config.deviceToken ? `Signed in as @${config.username}` : "Not signed in"}\nDevice: ${config.deviceId}\nTimezone: ${config.timezone}\nLast published: ${config.lastSuccessfulSync ?? "never"}\nConfig: ${configPath()}\n`); }
export async function logout(): Promise<void> { const config = await loadConfig(); let warning = ""; if (config.deviceToken) { try { await revokeDevice(config); } catch { warning = " The server could not be reached, so revoke the device from Settings when you are online."; } } await clearLogin(); process.stdout.write(`${pc.green("✓")} Signed out and revoked the local device when reachable.${warning}\n`); }

export async function providers(provider?: string): Promise<void> {
  if (!provider) { process.stdout.write("Verify provider usage to join the verified leaderboard:\n\n  openrouter  Management API key\n  openai      Organization Admin API key (sk-admin-…)\n  anthropic   Organization Admin API key\n\nNormal inference/project keys do not have access to organization usage reports.\nYou can also verify through https://tokenlawn.dev/settings/providers\n\nRun: tokenlawn providers verify <provider>\n"); return; }
  if (!new Set(["openrouter", "openai", "anthropic"]).has(provider)) throw new Error("Provider must be openrouter, openai, or anthropic.");
  const config = await loadConfig(); if (!config.deviceToken) await login();
  const details={openrouter:{name:"OpenRouter",requirement:"a Management API key",credential:"Management API key",url:"https://openrouter.ai/docs/guides/overview/auth/management-api-keys"},openai:{name:"OpenAI",requirement:"an organization Admin API key (sk-admin-…)",credential:"organization Admin API key",url:"https://platform.openai.com/settings/organization/admin-keys"},anthropic:{name:"Anthropic",requirement:"an organization Admin API key",credential:"organization Admin API key",url:"https://docs.anthropic.com/en/api/admin-api/usage-cost/get-messages-usage-report"}}[provider]!;
  process.stdout.write(`\n${details.name} verification requires ${details.requirement}.\nA normal inference or project API key will not work.\n\nGet the required API key:\n${details.url}\n\nThe key will be sent over HTTPS to TokenLawn, used immediately to query ${details.name}, never written to the database or logs, and discarded after verification. Consider creating a temporary key and revoking it afterward.\n\n`);
  const credential = await promptSecret(`${details.name} ${details.credential}: `);
  try { const result = await verifyProvider(await loadConfig(), provider, credential.trim()); process.stdout.write(`${pc.green("✓")} Verified ${formatTokens(result.processedTokens)} tokens through ${result.verifiedThrough}.\n`); }
  finally { /* Do not retain provider credentials beyond this request scope. */ }
}
