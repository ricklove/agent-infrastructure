import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ProjectReference = {
  path: string;
};

type ProjectList = {
  references?: ProjectReference[];
};

const repoRoot = import.meta.dir ? resolve(import.meta.dir, "..") : process.cwd();
const tsgoPath = resolve(repoRoot, "node_modules/.bin/tsgo");
const configPath = resolve(repoRoot, "tsconfig.projects.json");

if (!existsSync(tsgoPath)) {
  console.error(`Missing tsgo binary at ${tsgoPath}. Run bun install first.`);
  process.exit(1);
}

const rawConfig = readFileSync(configPath, "utf8");
const config = JSON.parse(rawConfig) as ProjectList;
const projectPaths = config.references?.map((reference) => reference.path) ?? [];

if (projectPaths.length === 0) {
  console.error(`No project references found in ${configPath}.`);
  process.exit(1);
}

for (const projectPath of projectPaths) {
  console.log(`tsgo ${projectPath}`);
  const processResult = Bun.spawnSync(
    [tsgoPath, "-b", projectPath, "--noEmit", "--pretty", "false"],
    {
      cwd: repoRoot,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (processResult.exitCode !== 0) {
    process.exit(processResult.exitCode);
  }
}
