import { Command } from "commander";
import pc from "picocolors";
import { login, logout, providers, publish, scan, status, sync } from "./commands.js";

const program = new Command().name("tokenlawn").description("See how much AI you use while coding").version("1.0.1");
program.option("--svg <path>", "write a local SVG").option("--json", "print normalized JSON").action(async (options) => { await scan(options); });
program.command("scan").description("scan history and show the local lawn").option("--svg <path>").option("--json").action(async (options) => { await scan(options); });
program.command("login").description("authorize this computer using a browser").action(login);
program.command("publish").description("scan, sign in if needed, and publish all history").action(publish);
program.command("sync").description("incrementally synchronize published usage").option("--full", "reconcile all history").action(sync);
program.command("status").description("show local account and sync status").action(status);
const providerCommand = program.command("providers").description("list provider verification options").action(() => providers());
providerCommand.command("verify <provider>").description("one-shot server verification").action(providers);
program.command("logout").description("remove the local device token").action(logout);
program.addHelpText("after", "\nPrivacy: local scans never upload prompts, responses, code, paths, repositories, commands, or usage totals. Publishing uploads only dates, sources, models, token counts, anonymous session hashes, and a random device ID.\n");

program.parseAsync().catch((error: unknown) => { process.stderr.write(`${pc.red("Error:")} ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
