import { describe, expect, it, vi } from "vitest";
import { version } from "../package.json";

vi.mock("./commands.js", () => ({
  login: vi.fn(), logout: vi.fn(), providers: vi.fn(), publish: vi.fn(), scan: vi.fn(), status: vi.fn(),
}));

import { createProgram } from "./program.js";

describe("CLI program", () => {
  it("prints the package version for --version", () => {
    const output = vi.fn();
    const program = createProgram().configureOutput({ writeOut: output }).exitOverride();
    expect(() => program.parse(["--version"], { from: "user" })).toThrow();
    expect(output).toHaveBeenCalledWith(`${version}\n`);
  });

  it("exposes publish with --full and no public sync command", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toEqual(["scan", "login", "publish", "status", "providers", "logout"]);
    expect(program.commands.find((command) => command.name() === "publish")?.options.map((option) => option.long)).toContain("--full");
    expect(program.helpInformation()).toContain("publish");
    expect(program.helpInformation()).not.toMatch(/^\s+sync\b/m);
  });
});
