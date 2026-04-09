import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { App } from "aws-cdk-lib"
import { CdkAdminStack } from "./cdk-admin-stack.js"

type CloudflareZoneConfig = {
  tunnelConfigParameterName: string
}

function readManagedTunnelConfig(
  stackName: string,
): CloudflareZoneConfig | undefined {
  const path = resolve(
    homedir(),
    ".cloudflared",
    "stack-tunnels",
    `${stackName}.json`,
  )
  if (!existsSync(path)) {
    return undefined
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as CloudflareZoneConfig
  if (!parsed.tunnelConfigParameterName?.trim()) {
    throw new Error(
      `managed cloudflare tunnel config missing tunnelConfigParameterName: ${path}`,
    )
  }

  return {
    tunnelConfigParameterName: parsed.tunnelConfigParameterName.trim(),
  }
}

const app = new App()
const stackName = app.node.tryGetContext("stackName")?.trim() || "AgentAdminCdk"
const agentHome =
  app.node.tryGetContext("agentHome")?.trim() || "/home/ec2-user"
const managedTunnel = readManagedTunnelConfig(stackName)

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
  "main"

new CdkAdminStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  agentHome,
  adminInstanceType,
  cloudflareTunnelConfigParameterName: managedTunnel?.tunnelConfigParameterName,
  runtimeRepoUrl,
  runtimeRepoRef,
})
