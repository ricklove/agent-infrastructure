import { App } from "aws-cdk-lib";
import { AwsSetupStack } from "./aws-setup-stack.js";

const app = new App();

const managerInstanceType =
  app.node.tryGetContext("managerInstanceType") ??
  process.env.MANAGER_INSTANCE_TYPE ??
  "t3.small";

const workerInstanceType =
  app.node.tryGetContext("workerInstanceType") ??
  process.env.WORKER_INSTANCE_TYPE ??
  "t3.small";

const swarmMaxSize = Number(
  app.node.tryGetContext("swarmMaxSize") ?? process.env.SWARM_MAX_SIZE ?? "12",
);

new AwsSetupStack(app, "AgentSwarmAwsSetup", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  managerInstanceType,
  workerInstanceType,
  swarmMaxSize,
});
