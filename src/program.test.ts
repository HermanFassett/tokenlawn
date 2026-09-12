import { describe, expect, it, vi } from "vitest";

vi.mock("./commands.js", () => ({
  login: vi.fn(), logout: vi.fn(), providers: vi.fn(), publish: vi.fn(), scan: vi.fn(), status: vi.fn(),
}));

import { createProgram } from "./program.js";

describe("CLI program", () => {
  it("exposes publish with --full and no public sync command", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toEqual(["scan", "login", "publish", "status", "providers", "logout"]);
    expect(program.commands.find((command) => command.name() === "publish")?.options.map((option) => option.long)).toContain("--full");
    expect(program.helpInformation()).toContain("publish");
    expect(program.helpInformation()).not.toMatch(/^\s+sync\b/m);
  });
});
