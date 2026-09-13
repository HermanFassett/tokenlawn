import { Command } from "commander";
import { version } from "../package.json";
import { login, logout, providers, publish, scan, status } from "./commands.js";

export function createProgram(): Command {
  const program = new Command().name("tokenlawn").description("Turn your AI token usage into a daily activity graph").version(version);
  program.option("--svg <path>", "save your lawn as a local SVG image").option("--json", "print usage records and totals as JSON").action(async (options) => { await scan(options); });
  program.command("scan").description("read local coding history and show your lawn").option("--svg <path>").option("--json").action(async (options) => { await scan(options); });
  program.command("login").description("connect this computer to your TokenLawn account").action(login);
  program.command("publish").description("publish new and changed usage to your public profile; sign in if needed").option("--full", "reconcile all available local history with your profile").action(publish);
  program.command("status").description("show your account and last publish time").action(status);
  const providerCommand = program.command("providers").description("show supported providers and required API keys").action(() => providers());
  providerCommand.command("verify <provider>").description("import usage directly from a provider").action(providers);
  program.command("logout").description("sign out and disconnect this computer").action(logout);
  program.addHelpText("after", "\nPrivacy: local scans never upload prompts, responses, code, paths, repositories, commands, or usage totals. Publishing uploads only dates, sources, models, token counts, anonymous session hashes, and a random device ID.\n");
  return program;
}
