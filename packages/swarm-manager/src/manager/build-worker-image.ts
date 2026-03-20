import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultWorkerImageProfileStorePath,
  getWorkerImageProfile,
  promoteWorkerImageProfile,
} from "./worker-image-profiles.js";

type BootstrapContext = {
  region?: string;
  workerInstanceProfileArn?: string;
  workerSecurityGroupId?: string;
  workerSubnetIds?: string[];
};

type BuildWorkflowResult = {
  ok: true;
  workflow: string;
  builderInstanceId: string;
  imageId: string;
  imageName: string;
  provisionResult: Record<string, unknown>;
};

type BuildWorkerImageConfig = {
  runtimeDir: string;
  workflow: string;
  profile: string;
  promote: boolean;
  imageName: string;
  region: string;
  subnetId: string;
  securityGroupId: string;
  instanceProfileArn: string;
  baseAmiId: string;
  builderInstanceType: string;
  profileStorePath: string;
};

function optionalOne(args: string[], flag: string): string | undefined {
  const index = args.findIndex((value) => value === `--${flag}`);
  if (index === -1) {
    return undefined;
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }

  return next;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

function readBootstrapContext(path: string): BootstrapContext {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as BootstrapContext;
  } catch {
    return {};
  }
}

function runChecked(command: string[], cwd?: string): string {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`command failed: ${command.join(" ")}`);
  }

  return result.stdout.toString("utf8").trim();
}

function lookupLatestAmazonLinuxAmiId(region: string): string {
  return runChecked([
    "aws",
    "ssm",
    "get-parameter",
    "--region",
    region,
    "--name",
    "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
    "--query",
    "Parameter.Value",
    "--output",
    "text",
  ]).trim();
}

function resolveBaseAmiId(
  explicitImageId: string | undefined,
  profile: string,
  region: string,
  profileStorePath: string,
): string {
  if (explicitImageId?.trim()) {
    return explicitImageId.trim();
  }

  const existingProfile = getWorkerImageProfile(profile, profileStorePath);
  if (existingProfile?.imageId?.trim()) {
    return existingProfile.imageId.trim();
  }

  return lookupLatestAmazonLinuxAmiId(region);
}

function parseArgs(argv: string[]): BuildWorkerImageConfig {
  const bootstrapContextPath =
    optionalOne(argv, "bootstrap-context") ??
    "/opt/agent-swarm/bootstrap-context.json";
  const bootstrapContext = readBootstrapContext(bootstrapContextPath);
  const runtimeDir = optionalOne(argv, "runtime-dir") ?? "/opt/agent-swarm/runtime";
  const workflow = optionalOne(argv, "workflow") ?? "bun-worker";
  const profile = optionalOne(argv, "profile") ?? workflow;
  const region = optionalOne(argv, "region") ?? bootstrapContext.region?.trim() ?? "";
  const subnetId =
    optionalOne(argv, "subnet-id") ??
    bootstrapContext.workerSubnetIds?.[0]?.trim() ??
    "";
  const securityGroupId =
    optionalOne(argv, "security-group-id") ??
    bootstrapContext.workerSecurityGroupId?.trim() ??
    "";
  const instanceProfileArn =
    optionalOne(argv, "instance-profile-arn") ??
    bootstrapContext.workerInstanceProfileArn?.trim() ??
    "";
  const builderInstanceType = optionalOne(argv, "builder-instance-type") ?? "t3.small";
  const profileStorePath =
    optionalOne(argv, "profile-store-path") ?? defaultWorkerImageProfileStorePath;

  if (!region) {
    throw new Error("region is required");
  }
  if (!subnetId) {
    throw new Error("subnet id is required");
  }
  if (!securityGroupId) {
    throw new Error("security group id is required");
  }
  if (!instanceProfileArn) {
    throw new Error("instance profile arn is required");
  }

  return {
    runtimeDir,
    workflow,
    profile,
    promote: hasFlag(argv, "promote"),
    imageName:
      optionalOne(argv, "image-name") ??
      `agent-swarm-${workflow}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
    region,
    subnetId,
    securityGroupId,
    instanceProfileArn,
    baseAmiId: resolveBaseAmiId(
      optionalOne(argv, "base-ami-id"),
      profile,
      region,
      profileStorePath,
    ),
    builderInstanceType,
    profileStorePath,
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const workflowDir = join(
    config.runtimeDir,
    "packages/swarm-manager/scripts/worker-images",
    config.workflow,
  );
  const buildScriptPath = join(workflowDir, "build.sh");
  if (!existsSync(buildScriptPath)) {
    throw new Error(`worker image workflow not found: ${config.workflow}`);
  }

  const output = runChecked(
    [
      "bash",
      buildScriptPath,
      "--region",
      config.region,
      "--base-ami-id",
      config.baseAmiId,
      "--subnet-id",
      config.subnetId,
      "--security-group-id",
      config.securityGroupId,
      "--instance-profile-arn",
      config.instanceProfileArn,
      "--builder-instance-type",
      config.builderInstanceType,
      "--image-name",
      config.imageName,
    ],
    config.runtimeDir,
  );

  const result = JSON.parse(output) as BuildWorkflowResult;
  let promotedProfile: Record<string, unknown> | undefined;
  if (config.promote) {
    const promoted = promoteWorkerImageProfile(
      {
        profile: config.profile,
        workflow: config.workflow,
        imageId: result.imageId,
        imageName: result.imageName,
        promotedAtMs: Date.now(),
      },
      config.profileStorePath,
    );
    promotedProfile = promoted;
  }

  console.log(
    JSON.stringify({
      ...result,
      profile: config.profile,
      promoted: config.promote,
      promotedProfile,
      profileStorePath: config.profileStorePath,
    }),
  );
}

await main();
