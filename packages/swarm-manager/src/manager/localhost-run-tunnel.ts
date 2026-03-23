import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: {
      type: "string",
    },
  },
  strict: true,
});

const port = Number.parseInt(values.port ?? "", 10);
if (!Number.isInteger(port) || port <= 0) {
  console.error("localhost-run-tunnel: invalid --port");
  process.exit(1);
}

const child = Bun.spawn(
  ["ssh", "-R", `80:localhost:${port}`, "nokey@localhost.run", "--", "--output", "json"],
  {
    stdin: "ignore",
    terminal: {
      cols: 80,
      rows: 24,
      data(_terminal, data) {
        process.stdout.write(data);
      },
      exit(_terminal, _status) {},
    },
  },
);

const exitCode = await child.exited;
process.exit(typeof exitCode === "number" ? exitCode : 1);
