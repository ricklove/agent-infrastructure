import { App } from "aws-cdk-lib"
import { CdkAdminStack } from "./cdk-admin-stack.js"

const app = new App()
const stackName = app.node.tryGetContext("stackName")?.trim() || "AgentAdminCdk"
const agentHome =
  app.node.tryGetContext("agentHome")?.trim() || "/home/ec2-user"

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
  runtimeRepoUrl,
  runtimeRepoRef,
})
