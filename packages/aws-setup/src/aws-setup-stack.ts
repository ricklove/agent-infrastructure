import {
  CfnOutput,
  Duration,
  Stack,
  StackProps,
  Tags,
} from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));

function writeFileCommand(targetPath: string, content: string): string {
  return `cat > ${targetPath} <<'EOF'\n${content}\nEOF`;
}

export interface AwsSetupStackProps extends StackProps {
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

    const swarmTagKey = "AgentSwarm";
    const swarmTagValue = `${this.stackName}-workers`;
    const managerMonitorPort = 8787;
    const dashboardEnrollmentSecret = randomBytes(32).toString("hex");
    const runtimeAsset = new s3assets.Asset(this, "RuntimeBundle", {
      path: resolve(sourceDir, "../../.."),
      exclude: [
        ".git",
        ".runtime",
        "node_modules",
        "cdk.out",
        "**/node_modules",
        "**/cdk.out",
        "**/.DS_Store",
        "**/dist",
      ],
    });
    const managerServiceUnit = `[Unit]
Description=Agent swarm monitoring server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/agent-swarm-monitor.env
ExecStart=/usr/local/bin/bun /opt/agent-swarm/swarm-manager/manager/server.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
    const workerServiceUnit = `[Unit]
Description=Agent swarm worker telemetry
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
EnvironmentFile=/etc/agent-swarm-worker-monitor.env
ExecStart=/usr/local/bin/bun /opt/agent-swarm/swarm-manager/worker/agent.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
    const managerNodeServiceUnit = `[Unit]
Description=Agent swarm manager self telemetry
After=network-online.target agent-swarm-monitor.service
Wants=network-online.target agent-swarm-monitor.service

[Service]
Type=simple
EnvironmentFile=/etc/agent-swarm-manager-node.env
ExecStart=/usr/local/bin/bun /opt/agent-swarm/swarm-manager/worker/agent.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
`;
    const workerUserDataTemplate = `#!/usr/bin/env bash
set -euo pipefail

dnf install -y awscli docker jq unzip
export HOME=/root
export BUN_INSTALL=/opt/bun
curl -fsSL https://bun.sh/install | bash
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
systemctl enable --now docker
usermod -aG docker ec2-user

mkdir -p /opt/agent-swarm/runtime
aws s3 cp "s3://__RUNTIME_ASSET_BUCKET__/__RUNTIME_ASSET_KEY__" /opt/agent-swarm/runtime.zip --region "__REGION__"
rm -rf /opt/agent-swarm/runtime/*
unzip -q /opt/agent-swarm/runtime.zip -d /opt/agent-swarm/runtime

cat > /etc/agent-swarm-worker-monitor.env <<'ENVFILE'
MONITOR_MANAGER_URL=ws://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/stream
MONITOR_SHARED_TOKEN=__SWARM_SHARED_TOKEN__
MONITOR_RECONNECT_DELAY_MS=1000
ENVFILE

cat > /etc/systemd/system/agent-swarm-worker-monitor.service <<'SERVICE'
${workerServiceUnit.replace(
  "/opt/agent-swarm/swarm-manager/worker/agent.ts",
  "/opt/agent-swarm/runtime/packages/swarm-manager/src/worker/agent.ts",
)}
SERVICE

TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
LOCAL_IPV4=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)

cat > /opt/agent-swarm/worker-runtime.json <<RUNTIME
{
  "instanceId": "$INSTANCE_ID",
  "privateIp": "$LOCAL_IPV4"
}
RUNTIME

systemctl daemon-reload
systemctl enable --now agent-swarm-worker-monitor.service
`;

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
    runtimeAsset.grantRead(workerRole);
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
    runtimeAsset.grantRead(managerRole);
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
      requireImdsv2: true,
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
          DASHBOARD_ENROLLMENT_SECRET: dashboardEnrollmentSecret,
          MANAGER_SWARM_TAG_VALUE: swarmTagValue,
          DASHBOARD_SESSION_TTL_SECONDS: "900",
        },
      },
    );
    const dashboardAccessUrl = dashboardAccessFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    dashboardPasskeyTable.grantReadWriteData(dashboardAccessFunction);
    dashboardAccessStateTable.grantReadWriteData(dashboardAccessFunction);
    dashboardAccessFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
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
      runtimeAssetBucket: runtimeAsset.s3BucketName,
      runtimeAssetKey: runtimeAsset.s3ObjectKey,
      managerMonitorPort,
      swarmMaxSize: props.swarmMaxSize,
      dashboardAccessApiBaseUrl: dashboardAccessUrl.url.replace(/\/$/, ""),
      dashboardEnrollmentSecret,
    };

    managerInstance.userData.addCommands(
      "dnf install -y awscli jq unzip openssl",
      "curl -fsSL https://pkg.cloudflare.com/cloudflared.repo -o /etc/yum.repos.d/cloudflared.repo",
      "dnf install -y cloudflared",
      "export HOME=/root",
      "export BUN_INSTALL=/opt/bun",
      "curl -fsSL https://bun.sh/install | bash",
      "install -m 0755 \"$BUN_INSTALL/bin/bun\" /usr/local/bin/bun",
      "mkdir -p /opt/agent-swarm/runtime /var/lib/agent-swarm-monitor",
      `cat > /opt/agent-swarm/bootstrap-context.json <<'EOF'\n${JSON.stringify(
        bootstrapPayload,
        null,
        2,
      )}\nEOF`,
      `aws s3 cp "s3://${runtimeAsset.s3BucketName}/${runtimeAsset.s3ObjectKey}" /opt/agent-swarm/runtime.zip --region "${this.region}"`,
      "rm -rf /opt/agent-swarm/runtime/*",
      "unzip -q /opt/agent-swarm/runtime.zip -d /opt/agent-swarm/runtime",
      "cd /opt/agent-swarm/runtime && bun install --frozen-lockfile",
      writeFileCommand(
        "/etc/systemd/system/agent-swarm-monitor.service",
        managerServiceUnit
          .replace(
            "/opt/agent-swarm/swarm-manager/manager/server.ts",
            "/opt/agent-swarm/runtime/packages/swarm-manager/src/manager/server.ts",
          ),
      ),
      writeFileCommand("/opt/agent-swarm/worker-user-data.sh", workerUserDataTemplate),
      "if [[ ! -s /opt/agent-swarm/swarm-shared-token ]]; then openssl rand -hex 32 > /opt/agent-swarm/swarm-shared-token; fi",
      "METADATA_TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')",
      "INSTANCE_ID=$(curl -s -H \"X-aws-ec2-metadata-token: $METADATA_TOKEN\" http://169.254.169.254/latest/meta-data/instance-id)",
      "MANAGER_PRIVATE_IP=$(curl -s -H \"X-aws-ec2-metadata-token: $METADATA_TOKEN\" http://169.254.169.254/latest/meta-data/local-ipv4)",
      "SWARM_SHARED_TOKEN=$(cat /opt/agent-swarm/swarm-shared-token)",
      "jq --arg managerPrivateIp \"$MANAGER_PRIVATE_IP\" --arg swarmSharedToken \"$SWARM_SHARED_TOKEN\" --argjson managerMonitorPort 8787 '. + {managerPrivateIp:$managerPrivateIp, swarmSharedToken:$swarmSharedToken, managerMonitorPort:$managerMonitorPort}' /opt/agent-swarm/bootstrap-context.json > /opt/agent-swarm/bootstrap-context.tmp",
      "mv /opt/agent-swarm/bootstrap-context.tmp /opt/agent-swarm/bootstrap-context.json",
      "cat > /etc/agent-swarm-monitor.env <<ENVFILE",
      "MANAGER_WS_HOST=0.0.0.0",
      "MANAGER_WS_PORT=8787",
      "SWARM_SHARED_TOKEN=$SWARM_SHARED_TOKEN",
      "METRICS_DB_PATH=/var/lib/agent-swarm-monitor/metrics.sqlite",
      "HEARTBEAT_TIMEOUT_SECONDS=5",
      "RAW_RETENTION_DAYS=7",
      "ROLLUP_1M_RETENTION_DAYS=30",
      "ROLLUP_1H_RETENTION_DAYS=365",
      "ENVFILE",
      "cat > /etc/agent-swarm-manager-node.env <<ENVFILE",
      "MONITOR_MANAGER_URL=ws://127.0.0.1:8787/workers/stream",
      "MONITOR_SHARED_TOKEN=$SWARM_SHARED_TOKEN",
      "MONITOR_RECONNECT_DELAY_MS=1000",
      "MONITOR_NODE_ROLE=manager",
      "MONITOR_WORKER_ID=$INSTANCE_ID",
      "MONITOR_INSTANCE_ID=$INSTANCE_ID",
      "MONITOR_PRIVATE_IP=$MANAGER_PRIVATE_IP",
      "ENVFILE",
      writeFileCommand(
        "/etc/systemd/system/agent-swarm-manager-node.service",
        managerNodeServiceUnit.replace(
          "/opt/agent-swarm/swarm-manager/worker/agent.ts",
          "/opt/agent-swarm/runtime/packages/swarm-manager/src/worker/agent.ts",
        ),
      ),
      "cat > /opt/agent-swarm/launch-worker.sh <<'EOF'",
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "CONFIG=/opt/agent-swarm/bootstrap-context.json",
      "REGION=$(jq -r '.region' \"$CONFIG\")",
      "TAG_KEY=$(jq -r '.swarmTagKey' \"$CONFIG\")",
      "TAG_VALUE=$(jq -r '.swarmTagValue' \"$CONFIG\")",
      "MANAGER_PRIVATE_IP=$(jq -r '.managerPrivateIp' \"$CONFIG\")",
      "MANAGER_MONITOR_PORT=$(jq -r '.managerMonitorPort' \"$CONFIG\")",
      "SWARM_SHARED_TOKEN=$(jq -r '.swarmSharedToken' \"$CONFIG\")",
      'INSTANCE_TYPE="${1:-}"',
      'if [[ -z "$INSTANCE_TYPE" ]]; then',
      '  INSTANCE_TYPE="$(jq -r \'.workerInstanceType\' "$CONFIG")"',
      "fi",
      'SUBNET_ID="${2:-}"',
      'if [[ -z "$SUBNET_ID" ]]; then',
      '  SUBNET_ID="$(jq -r \'.workerSubnetIds[0]\' "$CONFIG")"',
      "fi",
      "SECURITY_GROUP_ID=$(jq -r '.workerSecurityGroupId' \"$CONFIG\")",
      "INSTANCE_PROFILE_ARN=$(jq -r '.workerInstanceProfileArn' \"$CONFIG\")",
      "RUNTIME_ASSET_BUCKET=$(jq -r '.runtimeAssetBucket' \"$CONFIG\")",
      "RUNTIME_ASSET_KEY=$(jq -r '.runtimeAssetKey' \"$CONFIG\")",
      "TEMP_USER_DATA=$(mktemp)",
      "trap 'rm -f \"$TEMP_USER_DATA\"' EXIT",
      "sed -e \"s/__MANAGER_PRIVATE_IP__/$MANAGER_PRIVATE_IP/g\" -e \"s/__MANAGER_MONITOR_PORT__/$MANAGER_MONITOR_PORT/g\" -e \"s/__SWARM_SHARED_TOKEN__/$SWARM_SHARED_TOKEN/g\" -e \"s/__RUNTIME_ASSET_BUCKET__/$RUNTIME_ASSET_BUCKET/g\" -e \"s#__RUNTIME_ASSET_KEY__#$RUNTIME_ASSET_KEY#g\" -e \"s/__REGION__/$REGION/g\" /opt/agent-swarm/worker-user-data.sh > \"$TEMP_USER_DATA\"",
      "IMAGE_ID=$(aws ec2 describe-images --owners amazon --region \"$REGION\" --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' 'Name=state,Values=available' --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)",
      "aws ec2 run-instances \\",
      "  --region \"$REGION\" \\",
      "  --image-id \"$IMAGE_ID\" \\",
      "  --instance-type \"$INSTANCE_TYPE\" \\",
      "  --iam-instance-profile Arn=\"$INSTANCE_PROFILE_ARN\" \\",
      "  --security-group-ids \"$SECURITY_GROUP_ID\" \\",
      "  --subnet-id \"$SUBNET_ID\" \\",
      "  --user-data file://\"$TEMP_USER_DATA\" \\",
      "  --tag-specifications \"ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Role,Value=agent-swarm-worker}]\" \"ResourceType=volume,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE}]\"",
      "EOF",
      "systemctl daemon-reload",
      "systemctl enable --now agent-swarm-monitor.service",
      "systemctl enable --now agent-swarm-manager-node.service",
      "chmod +x /opt/agent-swarm/launch-worker.sh",
      "chmod +x /opt/agent-swarm/worker-user-data.sh",
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
  }
}
