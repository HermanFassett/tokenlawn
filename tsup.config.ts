import { defineConfig } from "tsup";
export default defineConfig({ entry: ["src/cli.ts"], format: ["esm"], dts: true, clean: true, banner: { js: "#!/usr/bin/env node" }, target: "node20", sourcemap: true, noExternal: ["@tokenlawn/core", "@tokenlawn/protocol", "@tokenlawn/renderer", "zod"] });
