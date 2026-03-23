import { requestWorkspacePersistence } from "./workspace-persistence.js";

function parseArgs(argv: string[]): { flushNow: boolean; reason: string } {
  let flushNow = false;
  let reason = "manual";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--flush-now") {
      flushNow = true;
      continue;
    }

    if (token === "--reason") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        reason = next;
        index += 1;
      }
    }
  }

  return {
    flushNow,
    reason,
  };
}

const input = parseArgs(process.argv.slice(2));
requestWorkspacePersistence({
  flushNow: input.flushNow,
  reason: input.reason,
  source: "operator",
});
