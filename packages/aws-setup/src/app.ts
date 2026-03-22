import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { App } from "aws-cdk-lib";
import { AwsSetupStack } from "./aws-setup-stack.js";

function awsCliBaseArgs(): string[] {
  const args: string[] = [];
  if (process.env.AWS_PROFILE?.trim()) {
    args.push("--profile", process.env.AWS_PROFILE.trim());
  }
  if (process.env.AWS_REGION?.trim()) {
    args.push("--region", process.env.AWS_REGION.trim());
  } else if (process.env.AWS_DEFAULT_REGION?.trim()) {
    args.push("--region", process.env.AWS_DEFAULT_REGION.trim());
  } else if (process.env.CDK_DEFAULT_REGION?.trim()) {
    args.push("--region", process.env.CDK_DEFAULT_REGION.trim());
  }
  return args;
}

function awsCliText(args: string[]): string | undefined {
  try {
    return execFileSync("aws", [...awsCliBaseArgs(), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveDashboardEnrollmentSecret(stackName: string): string {
  const functionName = awsCliText([
    "cloudformation",
    "describe-stack-resources",
    "--stack-name",
    stackName,
    "--logical-resource-id",
    "DashboardAccessFunctionAE9E050D",
    "--query",
    "StackResources[0].PhysicalResourceId",
    "--output",
    "text",
  ]);

  if (functionName && functionName !== "None") {
    const currentSecret = awsCliText([
      "lambda",
      "get-function-configuration",
      "--function-name",
      functionName,
      "--query",
      "Environment.Variables.DASHBOARD_ENROLLMENT_SECRET",
      "--output",
      "text",
    ]);
    if (currentSecret && currentSecret !== "None") {
      return currentSecret;
    }
  }

  return randomBytes(32).toString("hex");
}

const app = new App();
const stackName = app.node.tryGetContext("stackName")?.trim() || "AgentSwarmAwsSetup";
const agentHome = app.node.tryGetContext("agentHome")?.trim() || "/home/ec2-user";
const dashboardEnrollmentSecret =
  app.node.tryGetContext("dashboardEnrollmentSecret")?.trim() ||
  process.env.DASHBOARD_ENROLLMENT_SECRET?.trim() ||
  resolveDashboardEnrollmentSecret(stackName);

const managerInstanceType =
  app.node.tryGetContext("managerInstanceType") ??
  process.env.MANAGER_INSTANCE_TYPE ??
  "t3.medium";

const workerInstanceType =
  app.node.tryGetContext("workerInstanceType") ??
  process.env.WORKER_INSTANCE_TYPE ??
  "t3.small";

const swarmMaxSize = Number(
  app.node.tryGetContext("swarmMaxSize") ?? process.env.SWARM_MAX_SIZE ?? "12",
);

new AwsSetupStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  agentHome,
  dashboardEnrollmentSecret,
  managerInstanceType,
  workerInstanceType,
  swarmMaxSize,
});
