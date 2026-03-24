import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
  Tags,
} from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));

export interface AwsSetupStackProps extends StackProps {
  agentHome: string;
  dashboardEnrollmentSecret: string;
  cloudflareTunnelConfigParameterName?: string;
  managerInstanceType: string;
  workerInstanceType: string;
  swarmMaxSize: number;
}

export class AwsSetupStack extends Stack {
  constructor(scope: Construct, id: string, props: AwsSetupStackProps) {
    super(scope, id, props);

    if (!Number.isFinite(props.swarmMaxSize) || props.swarmMaxSize < 1) {
      throw new Error("swarmMaxSize must be a positive integer");
    }
    if (!props.agentHome || !props.agentHome.startsWith("/")) {
      throw new Error("agentHome must be an absolute path");
    }

    const swarmTagKey = "AgentSwarm";
    const swarmTagValue = `${this.stackName}-workers`;
    const managerMonitorPort = 8787;
    const dashboardEnrollmentSecretSecret = new secretsmanager.Secret(
      this,
      "DashboardEnrollmentSecret",
      {
        secretStringValue: SecretValue.unsafePlainText(
          props.dashboardEnrollmentSecret,
        ),
      },
    );
    const dashboardEnrollmentRuntimeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "DashboardEnrollmentRuntimeSecret",
      `/agent-infrastructure/${this.stackName}/dashboard/enrollment-secret`,
    );
    const cloudflareTunnelTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "CloudflareTunnelToken",
      `/agent-infrastructure/${this.stackName}/cloudflare/tunnel-token`,
    );
    const runtimeRepoUrl = "https://github.com/ricklove/agent-infrastructure.git";
    const runtimeRepoRef = "development";
    const runtimeRoot = `${props.agentHome}/runtime`;
    const stateRoot = `${props.agentHome}/state`;
    const workspaceRoot = `${props.agentHome}/workspace`;
    const workerRuntimeReleaseBucket = new s3.Bucket(
      this,
      "WorkerRuntimeReleaseBucket",
      {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      },
    );
    const vpc = new ec2.Vpc(this, "AgentSwarmVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "swarm",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    Tags.of(vpc).add(swarmTagKey, swarmTagValue);

    const managerSecurityGroup = new ec2.SecurityGroup(
      this,
      "ManagerSecurityGroup",
      {
        vpc,
        description: "Security group for the agent swarm manager instance",
        allowAllOutbound: true,
      },
    );

    const workerSecurityGroup = new ec2.SecurityGroup(
      this,
      "WorkerSecurityGroup",
      {
        vpc,
        description: "Security group for isolated agent swarm worker instances",
        allowAllOutbound: true,
      },
    );

    workerSecurityGroup.addIngressRule(
      workerSecurityGroup,
      ec2.Port.allTraffic(),
      "Allow worker-to-worker traffic inside the swarm",
    );
    workerSecurityGroup.addIngressRule(
      managerSecurityGroup,
      ec2.Port.allTraffic(),
      "Allow manager traffic to worker instances",
    );
    managerSecurityGroup.addIngressRule(
      workerSecurityGroup,
      ec2.Port.allTraffic(),
      "Allow worker traffic to the manager instance over private IPs",
    );

    const workerRole = new iam.Role(this, "WorkerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Role attached to agent swarm worker instances",
    });
    workerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonSSMManagedInstanceCore",
      ),
    );
    workerRuntimeReleaseBucket.grantRead(workerRole);
    Tags.of(workerRole).add(swarmTagKey, swarmTagValue);

    const workerInstanceProfile = new iam.CfnInstanceProfile(
      this,
      "WorkerInstanceProfile",
      {
        roles: [workerRole.roleName],
      },
    );

    const managerRole = new iam.Role(this, "ManagerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description:
        "Role attached to the manager instance that launches and manages the worker swarm",
    });
    managerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonSSMManagedInstanceCore",
      ),
    );
    dashboardEnrollmentSecretSecret.grantRead(managerRole);
    cloudflareTunnelTokenSecret.grantRead(managerRole);
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadCloudflareTunnelConfig",
        actions: ["ssm:GetParameter"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: `agent-infrastructure/${this.stackName}/cloudflare/config`,
          }),
        ],
      }),
    );
    workerRuntimeReleaseBucket.grantReadWrite(managerRole);
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadEc2Inventory",
        actions: [
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeImages",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeTags",
          "ec2:DescribeVolumes",
          "ec2:DescribeVpcs",
          "iam:GetRole",
          "iam:GetInstanceProfile",
          "ssm:DescribeInstanceInformation",
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
          "ssm:ListCommands",
        ],
        resources: ["*"],
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "RunTaggedWorkerInstances",
        actions: ["ec2:RunInstances"],
        resources: ["*"],
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "TagWorkerInstancesOnLaunch",
        actions: ["ec2:CreateTags"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ec2:CreateAction": "RunInstances",
          },
        },
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ManageTaggedWorkerInstances",
        actions: [
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:RebootInstances",
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:TerminateInstances",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            [`ec2:ResourceTag/${swarmTagKey}`]: swarmTagValue,
          },
        },
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ManageWorkerImageBuilders",
        actions: [
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:RebootInstances",
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ec2:TerminateInstances",
        ],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ec2:ResourceTag/WorkerImageWorkflow": "bun-worker",
          },
        },
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "CreateWorkerImages",
        actions: ["ec2:CreateImage"],
        resources: ["*"],
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "TagWorkerImagesOnCreate",
        actions: ["ec2:CreateTags"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ec2:CreateAction": "CreateImage",
          },
        },
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "PassWorkerRole",
        actions: ["iam:PassRole"],
        resources: [workerRole.roleArn],
        conditions: {
          StringEquals: {
            "iam:PassedToService": "ec2.amazonaws.com",
          },
        },
      }),
    );
    managerRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "OperateWorkersWithSsm",
        actions: [
          "ssm:CancelCommand",
          "ssm:SendCommand",
          "ssm:StartSession",
          "ssm:TerminateSession",
        ],
        resources: ["*"],
      }),
    );

    const managerInstance = new ec2.Instance(this, "ManagerInstance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: managerSecurityGroup,
      role: managerRole,
      instanceType: new ec2.InstanceType(props.managerInstanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      httpTokens: ec2.HttpTokens.REQUIRED,
      ssmSessionPermissions: false,
    });

    Tags.of(managerInstance).add("Role", "agent-swarm-manager");
    Tags.of(managerInstance).add(swarmTagKey, swarmTagValue);

    const workerSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    }).subnetIds;

    const dashboardPasskeyTable = new dynamodb.Table(
      this,
      "DashboardPasskeyTable",
      {
        partitionKey: {
          name: "credentialId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      },
    );

    const dashboardAccessStateTable = new dynamodb.Table(
      this,
      "DashboardAccessStateTable",
      {
        partitionKey: {
          name: "stateId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      },
    );

    const dashboardAccessFunction = new NodejsFunction(
      this,
      "DashboardAccessFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: resolve(sourceDir, "../../dashboard-access/src/handler.ts"),
        handler: "handler",
        timeout: Duration.seconds(30),
        memorySize: 512,
        environment: {
          DASHBOARD_PASSKEY_TABLE_NAME: dashboardPasskeyTable.tableName,
          DASHBOARD_ACCESS_STATE_TABLE_NAME: dashboardAccessStateTable.tableName,
          DASHBOARD_ENROLLMENT_SECRET: props.dashboardEnrollmentSecret,
          DASHBOARD_ENROLLMENT_SECRET_SECRET_NAME:
            `/agent-infrastructure/${this.stackName}/dashboard/enrollment-secret`,
          MANAGER_SWARM_TAG_VALUE: swarmTagValue,
          AGENT_HOME: props.agentHome,
          DASHBOARD_SESSION_TTL_SECONDS: "900",
        },
      },
    );
    const dashboardAccessUrl = dashboardAccessFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    dashboardPasskeyTable.grantReadWriteData(dashboardAccessFunction);
    dashboardAccessStateTable.grantReadWriteData(dashboardAccessFunction);
    dashboardEnrollmentRuntimeSecret.grantRead(dashboardAccessFunction);
    dashboardAccessFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:RebootInstances",
          "ec2:DescribeInstances",
          "ssm:GetCommandInvocation",
          "ssm:SendCommand",
        ],
        resources: ["*"],
      }),
    );

    const bootstrapPayload = {
      region: this.region,
      swarmTagKey,
      swarmTagValue,
      workerInstanceType: props.workerInstanceType,
      workerInstanceProfileArn: workerInstanceProfile.attrArn,
      workerSecurityGroupId: workerSecurityGroup.securityGroupId,
      workerSubnetIds: workerSubnets,
      runtimeRepoUrl,
      runtimeRepoRef,
      agentHome: props.agentHome,
      workerRuntimeReleaseBucketName: workerRuntimeReleaseBucket.bucketName,
      managerMonitorPort,
      swarmMaxSize: props.swarmMaxSize,
      dashboardAccessApiBaseUrl: dashboardAccessUrl.url.replace(/\/$/, ""),
      dashboardEnrollmentSecret: props.dashboardEnrollmentSecret,
    };

    managerInstance.userData.addCommands(
      "dnf install -y git",
      `mkdir -p ${runtimeRoot} ${stateRoot} ${workspaceRoot}`,
      `cat > ${stateRoot}/bootstrap-context.json <<'EOF'\n${JSON.stringify(
        bootstrapPayload,
        null,
        2,
      )}\nEOF`,
      `if [[ -d ${runtimeRoot}/.git ]]; then cd ${runtimeRoot} && git fetch --tags origin && git checkout "${runtimeRepoRef}" && git pull --ff-only origin "${runtimeRepoRef}"; else rm -rf ${runtimeRoot} && git clone --branch "${runtimeRepoRef}" --single-branch "${runtimeRepoUrl}" ${runtimeRoot}; fi`,
      `bash ${runtimeRoot}/scripts/setup.sh --runtime-dir ${runtimeRoot} --state-dir ${stateRoot} --workspace-dir ${workspaceRoot} --bootstrap-context ${stateRoot}/bootstrap-context.json`,
    );

    new CfnOutput(this, "ManagerInstanceId", {
      value: managerInstance.instanceId,
    });
    new CfnOutput(this, "ManagerRoleArn", {
      value: managerRole.roleArn,
    });
    new CfnOutput(this, "ManagerPrivateIp", {
      value: managerInstance.instancePrivateIp,
    });
    new CfnOutput(this, "ManagerSecurityGroupId", {
      value: managerSecurityGroup.securityGroupId,
    });
    new CfnOutput(this, "ManagerMonitorPort", {
      value: String(managerMonitorPort),
    });
    new CfnOutput(this, "WorkerRoleArn", {
      value: workerRole.roleArn,
    });
    new CfnOutput(this, "WorkerInstanceProfileArn", {
      value: workerInstanceProfile.attrArn,
    });
    new CfnOutput(this, "WorkerSecurityGroupId", {
      value: workerSecurityGroup.securityGroupId,
    });
    new CfnOutput(this, "WorkerSubnetIds", {
      value: workerSubnets.join(","),
    });
    new CfnOutput(this, "SwarmTag", {
      value: `${swarmTagKey}=${swarmTagValue}`,
    });
    new CfnOutput(this, "DashboardAccessUrl", {
      value: dashboardAccessUrl.url,
    });
    new CfnOutput(this, "WorkerRuntimeReleaseBucketName", {
      value: workerRuntimeReleaseBucket.bucketName,
    });
    new CfnOutput(this, "DashboardEnrollmentSecretArn", {
      value: dashboardEnrollmentSecretSecret.secretArn,
    });
    if (props.cloudflareTunnelConfigParameterName) {
      new CfnOutput(this, "CloudflareTunnelConfigParameterName", {
        value: props.cloudflareTunnelConfigParameterName,
      });
    }
  }
}
