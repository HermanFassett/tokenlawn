import pc from "picocolors";
import { createProgram } from "./program.js";

createProgram().parseAsync().catch((error: unknown) => { process.stderr.write(`${pc.red("Error:")} ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
