import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { App } from "aws-cdk-lib"
import { CdkAdminStack } from "./cdk-admin-stack.js"

function awsCliBaseArgs(): string[] {
  const args: string[] = []
  if (process.env.AWS_PROFILE?.trim()) {
    args.push("--profile", process.env.AWS_PROFILE.trim())
  }
  if (process.env.AWS_REGION?.trim()) {
    args.push("--region", process.env.AWS_REGION.trim())
  } else if (process.env.AWS_DEFAULT_REGION?.trim()) {
    args.push("--region", process.env.AWS_DEFAULT_REGION.trim())
  } else if (process.env.CDK_DEFAULT_REGION?.trim()) {
    args.push("--region", process.env.CDK_DEFAULT_REGION.trim())
  }
  return args
}

function awsCliText(args: string[]): string | undefined {
  try {
    return execFileSync("aws", [...awsCliBaseArgs(), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
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
  ])

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
    ])
    if (currentSecret && currentSecret !== "None") {
      return currentSecret
    }
  }

  return randomBytes(32).toString("hex")
}

const app = new App()
const stackName = app.node.tryGetContext("stackName")?.trim() || "AgentAdminCdk"
const agentHome =
  app.node.tryGetContext("agentHome")?.trim() || "/home/ec2-user"
const dashboardEnrollmentSecret =
  app.node.tryGetContext("dashboardEnrollmentSecret")?.trim() ||
  process.env.DASHBOARD_ENROLLMENT_SECRET?.trim() ||
  resolveDashboardEnrollmentSecret(stackName)

const adminInstanceType =
  app.node.tryGetContext("adminInstanceType") ??
  process.env.ADMIN_INSTANCE_TYPE ??
  "t3.large"

const runtimeRepoUrl =
  app.node.tryGetContext("runtimeRepoUrl")?.trim() ||
  process.env.RUNTIME_REPO_URL?.trim() ||
  "https://github.com/ricklove/agent-infrastructure.git"

const runtimeRepoRef =
  app.node.tryGetContext("runtimeRepoRef")?.trim() ||
  process.env.RUNTIME_REPO_REF?.trim() ||
  "development"

new CdkAdminStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  agentHome,
  adminInstanceType,
  dashboardEnrollmentSecret,
  runtimeRepoUrl,
  runtimeRepoRef,
})
