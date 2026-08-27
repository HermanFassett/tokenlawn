export async function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    const { createInterface } = await import("node:readline/promises");
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try { return await terminal.question(label); }
    finally { terminal.close(); }
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\u0003") { finish(new Error("Verification cancelled.")); return; }
        if (character === "\u007f" || character === "\b") { value = value.slice(0, -1); continue; }
        if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}
