import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  Tags,
} from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import type { Construct } from "constructs"

const sourceDir = dirname(fileURLToPath(import.meta.url))

export interface CdkAdminStackProps extends StackProps {
  agentHome: string
  adminInstanceType: string
  cloudflareTunnelConfigParameterName?: string
  runtimeRepoUrl: string
  runtimeRepoRef: string
}

export class CdkAdminStack extends Stack {
  constructor(scope: Construct, id: string, props: CdkAdminStackProps) {
    super(scope, id, props)

    const runtimeRoot = `${props.agentHome}/runtime`
    const stateRoot = `${props.agentHome}/state`
    const workspaceRoot = `${props.agentHome}/workspace`
    const adminScopeTagValue = `${this.stackName}-admin`
    const dashboardEnrollmentRuntimeSecret =
      secretsmanager.Secret.fromSecretNameV2(
        this,
        "DashboardEnrollmentRuntimeSecret",
        `/agent-infrastructure/${this.stackName}/dashboard/enrollment-secret`,
      )
    const cloudflareTunnelTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "CloudflareTunnelToken",
      `/agent-infrastructure/${this.stackName}/cloudflare/tunnel-token`,
    )
    const cdkBootstrapBucketArns = [
      `arn:${this.partition}:s3:::cdk-*`,
      `arn:${this.partition}:s3:::cdk-*/*`,
    ]

    const vpc = new ec2.Vpc(this, "AdminVpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "admin",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    })

    const adminSecurityGroup = new ec2.SecurityGroup(
      this,
      "AdminSecurityGroup",
      {
        vpc,
        description: "Security group for the isolated stack admin host",
        allowAllOutbound: true,
      },
    )

    const adminRole = new iam.Role(this, "AdminInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description:
        "Role attached to the stack admin instance for cross-stack deployment and repair work",
    })
    adminRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonSSMManagedInstanceCore",
      ),
    )
    dashboardEnrollmentRuntimeSecret.grantRead(adminRole)
    if (props.cloudflareTunnelConfigParameterName?.trim()) {
      cloudflareTunnelTokenSecret.grantRead(adminRole)
      adminRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadCloudflareTunnelConfig",
          actions: ["ssm:GetParameter"],
          resources: [
            Stack.of(this).formatArn({
              service: "ssm",
              resource: "parameter",
              resourceName: props.cloudflareTunnelConfigParameterName.replace(
                /^\//,
                "",
              ),
            }),
          ],
        }),
      )
    }
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminReadInventory",
        actions: [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeInstanceTypes",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets",
          "ec2:DescribeTags",
          "ec2:DescribeVpcs",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackResources",
          "ssm:DescribeInstanceInformation",
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
          "ssm:ListCommands",
        ],
        resources: ["*"],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminCloudFormationDeploy",
        actions: ["cloudformation:*"],
        resources: ["*"],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminProvisioningViaCloudFormationOnly",
        actions: [
          "ec2:*",
          "iam:*",
          "lambda:*",
          "dynamodb:*",
          "s3:*",
          "ssm:*",
          "secretsmanager:*",
          "logs:*",
          "cloudwatch:*",
        ],
        resources: ["*"],
        conditions: {
          "ForAnyValue:StringEquals": {
            "aws:CalledVia": "cloudformation.amazonaws.com",
          },
        },
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminPublishCdkAssets",
        actions: [
          "s3:GetBucketLocation",
          "s3:GetBucketVersioning",
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
        ],
        resources: cdkBootstrapBucketArns,
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminReadCdkBootstrapMetadata",
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: "cdk-bootstrap/*",
          }),
        ],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminAssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-*`,
        ],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminRepairManagedHosts",
        actions: [
          "ec2:RebootInstances",
          "ec2:StartInstances",
          "ec2:StopInstances",
          "ssm:DescribeInstanceInformation",
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
          "ssm:ListCommands",
          "ssm:SendCommand",
          "ssm:StartSession",
          "ssm:ResumeSession",
          "ssm:TerminateSession",
        ],
        resources: ["*"],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminPersistManagedStackCloudflareTunnelSecret",
        actions: [
          "secretsmanager:CreateSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecret",
        ],
        resources: [
          Stack.of(this).formatArn({
            service: "secretsmanager",
            resource: "secret",
            resourceName:
              "agent-infrastructure/*/cloudflare/tunnel-token*",
          }),
        ],
      }),
    )
    adminRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AdminPersistManagedStackCloudflareConfigParameter",
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter",
            resourceName: "agent-infrastructure/*/cloudflare/config",
          }),
        ],
      }),
    )

    const adminInstance = new ec2.Instance(this, "AdminInstance", {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: adminSecurityGroup,
      role: adminRole,
      instanceType: new ec2.InstanceType(props.adminInstanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      httpTokens: ec2.HttpTokens.REQUIRED,
      ssmSessionPermissions: false,
    })
    Tags.of(adminInstance).add("Role", "agent-admin-host")
    Tags.of(adminInstance).add("AgentSwarm", adminScopeTagValue)
    Tags.of(adminInstance).add("HostRole", "admin")

    const dashboardPasskeyTable = new dynamodb.Table(
      this,
      "DashboardPasskeyTable",
      {
        partitionKey: {
          name: "credentialId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    )

    const dashboardAccessStateTable = new dynamodb.Table(
      this,
      "DashboardAccessStateTable",
      {
        partitionKey: {
          name: "stateId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    )

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
          DASHBOARD_ACCESS_STATE_TABLE_NAME:
            dashboardAccessStateTable.tableName,
          DASHBOARD_ENROLLMENT_SECRET_SECRET_NAME: `/agent-infrastructure/${this.stackName}/dashboard/enrollment-secret`,
          TARGET_TAG_KEY: "AgentSwarm",
          TARGET_TAG_VALUE: adminScopeTagValue,
          TARGET_ROLE_TAG_KEY: "Role",
          TARGET_ROLE_TAG_VALUE: "agent-admin-host",
          TARGET_HOST_ROLE: "admin",
          TARGET_RECONCILE_BEFORE_SESSION: "false",
          AGENT_HOME: props.agentHome,
          DASHBOARD_SESSION_TTL_SECONDS: "900",
        },
      },
    )
    const dashboardAccessUrl = dashboardAccessFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })
    dashboardPasskeyTable.grantReadWriteData(dashboardAccessFunction)
    dashboardAccessStateTable.grantReadWriteData(dashboardAccessFunction)
    dashboardEnrollmentRuntimeSecret.grantRead(dashboardAccessFunction)
    dashboardAccessFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:DescribeInstances",
          "ec2:RebootInstances",
          "ssm:GetCommandInvocation",
          "ssm:SendCommand",
        ],
        resources: ["*"],
      }),
    )

    const bootstrapPayload = {
      region: this.region,
      hostRole: "admin",
      runtimeRepoUrl: props.runtimeRepoUrl,
      runtimeRepoRef: props.runtimeRepoRef,
      agentHome: props.agentHome,
      dashboardAccessApiBaseUrl: dashboardAccessUrl.url.replace(/\/$/, ""),
      dashboardEnrollmentSecretSecretName: `/agent-infrastructure/${this.stackName}/dashboard/enrollment-secret`,
      cloudflareTunnelConfigParameterName:
        props.cloudflareTunnelConfigParameterName ?? "",
      cloudflareTunnelTokenSecretName:
        props.cloudflareTunnelConfigParameterName?.trim()
          ? `/agent-infrastructure/${this.stackName}/cloudflare/tunnel-token`
          : "",
      adminCompatPort: 8787,
    }

    const runtimeTarget = {
      schemaVersion: 1,
      role: "admin",
      runtimeSource: {
        repoUrl: props.runtimeRepoUrl,
        refKind: "branch",
        ref: props.runtimeRepoRef,
      },
    }

    adminInstance.userData.addCommands(
      "dnf install -y git",
      `mkdir -p ${runtimeRoot} ${stateRoot} ${workspaceRoot}`,
      `cat > ${stateRoot}/bootstrap-context.json <<'EOF'\n${JSON.stringify(
        bootstrapPayload,
        null,
        2,
      )}\nEOF`,
      `cat > ${props.agentHome}/runtime-target.json <<'EOF'\n${JSON.stringify(
        runtimeTarget,
        null,
        2,
      )}\nEOF`,
      `if [[ -d ${runtimeRoot}/.git ]]; then cd ${runtimeRoot} && git fetch --tags origin && git checkout "${props.runtimeRepoRef}" && git pull --ff-only origin "${props.runtimeRepoRef}"; else rm -rf ${runtimeRoot} && git clone --branch "${props.runtimeRepoRef}" --single-branch "${props.runtimeRepoUrl}" ${runtimeRoot}; fi`,
      `bash ${runtimeRoot}/scripts/setup-admin.sh --runtime-dir ${runtimeRoot} --state-dir ${stateRoot} --workspace-dir ${workspaceRoot} --bootstrap-context ${stateRoot}/bootstrap-context.json --runtime-target ${props.agentHome}/runtime-target.json`,
    )

    new CfnOutput(this, "AdminInstanceId", {
      value: adminInstance.instanceId,
    })
    new CfnOutput(this, "AdminInstancePrivateIp", {
      value: adminInstance.instancePrivateIp,
    })
    new CfnOutput(this, "DashboardAccessUrl", {
      value: dashboardAccessUrl.url,
    })
  }
}
