import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

type BootstrapContext = {
  region: string;
  workerRuntimeReleaseBucketName: string;
};

type RuntimeReleaseManifest = {
  bucket: string;
  key: string;
  releaseId: string;
  publishedAt: string;
  sourceRuntimeDir: string;
};

function parseArgs(argv: string[]): Map<string, string[]> {
  const args = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, [...(args.get(key) ?? []), "true"]);
      continue;
    }

    args.set(key, [...(args.get(key) ?? []), next]);
    index += 1;
  }

  return args;
}

function optionalOne(args: Map<string, string[]>, key: string): string | undefined {
  const value = args.get(key)?.[0]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function utcTimestampReleaseId(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bootstrapContextPath =
    optionalOne(args, "bootstrap-context") ?? "/opt/agent-swarm/bootstrap-context.json";
  const runtimeDir = optionalOne(args, "runtime-dir") ?? "/opt/agent-swarm/runtime";
  const manifestPath =
    optionalOne(args, "manifest-path") ?? "/opt/agent-swarm/worker-runtime-release.json";
  const keyPrefix = optionalOne(args, "key-prefix") ?? "releases";
  const releaseId = optionalOne(args, "release-id") ?? utcTimestampReleaseId();

  const bootstrapContext = await readJsonFile<BootstrapContext>(bootstrapContextPath);
  if (!bootstrapContext.region || !bootstrapContext.workerRuntimeReleaseBucketName) {
    throw new Error("bootstrap context is missing worker runtime release bucket metadata");
  }

  const tempRoot = mkdtempSync(resolve(tmpdir(), "worker-runtime-release-"));
  const archivePath = resolve(tempRoot, `worker-runtime-${releaseId}.zip`);
  const archiveCwd = runtimeDir;
  const bucket = bootstrapContext.workerRuntimeReleaseBucketName;
  const key = `${keyPrefix.replace(/^\/+|\/+$/g, "")}/${releaseId}.zip`;

  try {
    const zipResult = Bun.spawnSync(["zip", "-qr", archivePath, "."], {
      cwd: archiveCwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (zipResult.exitCode !== 0) {
      throw new Error(zipResult.stderr.toString("utf8").trim() || "zip failed");
    }

    const uploadResult = Bun.spawnSync(
      [
        "aws",
        "s3",
        "cp",
        archivePath,
        `s3://${bucket}/${key}`,
        "--region",
        bootstrapContext.region,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    if (uploadResult.exitCode !== 0) {
      throw new Error(
        uploadResult.stderr.toString("utf8").trim() || "runtime release upload failed",
      );
    }

    const manifest: RuntimeReleaseManifest = {
      bucket,
      key,
      releaseId,
      publishedAt: new Date().toISOString(),
      sourceRuntimeDir: runtimeDir,
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(JSON.stringify({ ok: true, manifest }));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
