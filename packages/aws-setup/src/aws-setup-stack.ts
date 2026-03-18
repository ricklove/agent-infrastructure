import {
  CfnOutput,
  Duration,
  RemovalPolicy,
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
    const runtimeRepoUrl = "https://github.com/ricklove/agent-infrastructure.git";
    const runtimeRepoRef = "development";
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

TOKEN=$(curl -X PUT -s http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600')
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
LOCAL_IPV4=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
MANAGER_EVENT_URL="http://__MANAGER_PRIVATE_IP__:__MANAGER_MONITOR_PORT__/workers/events"

emit_event() {
  local event_type="$1"
  local details_json="\${2:-{}}"
  curl -sf -X POST "$MANAGER_EVENT_URL" \
    -H 'content-type: application/json' \
    -H "x-swarm-token: __SWARM_SHARED_TOKEN__" \
    -d "{\"workerId\":\"$INSTANCE_ID\",\"instanceId\":\"$INSTANCE_ID\",\"privateIp\":\"$LOCAL_IPV4\",\"nodeRole\":\"worker\",\"eventType\":\"$event_type\",\"eventTsMs\":$(($(date +%s) * 1000)),\"details\":$details_json}" >/dev/null || true
}

emit_event bootstrap_started "{\"stage\":\"cloud-init\"}"
systemctl enable --now docker
usermod -aG docker ec2-user
emit_event docker_ready "{}"

mkdir -p /opt/agent-swarm/runtime
emit_event runtime_download_started "{\"bucket\":\"__WORKER_RUNTIME_RELEASE_BUCKET__\",\"key\":\"__WORKER_RUNTIME_RELEASE_KEY__\"}"
aws s3 cp "s3://__WORKER_RUNTIME_RELEASE_BUCKET__/__WORKER_RUNTIME_RELEASE_KEY__" /opt/agent-swarm/runtime.zip --region "__REGION__"
rm -rf /opt/agent-swarm/runtime/*
unzip -q /opt/agent-swarm/runtime.zip -d /opt/agent-swarm/runtime
emit_event runtime_download_completed "{}"

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

cat > /opt/agent-swarm/worker-runtime.json <<RUNTIME
{
  "instanceId": "$INSTANCE_ID",
  "privateIp": "$LOCAL_IPV4"
}
RUNTIME

systemctl daemon-reload
emit_event telemetry_started "{}"
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
      runtimeRepoUrl,
      runtimeRepoRef,
      workerRuntimeReleaseBucketName: workerRuntimeReleaseBucket.bucketName,
      managerMonitorPort,
      swarmMaxSize: props.swarmMaxSize,
      dashboardAccessApiBaseUrl: dashboardAccessUrl.url.replace(/\/$/, ""),
      dashboardEnrollmentSecret,
    };

    managerInstance.userData.addCommands(
      "dnf install -y awscli git jq unzip zip openssl",
      "curl -fsSL https://pkg.cloudflare.com/cloudflared.repo -o /etc/yum.repos.d/cloudflared.repo",
      "dnf install -y cloudflared",
      "export HOME=/root",
      "export BUN_INSTALL=/opt/bun",
      "curl -fsSL https://bun.sh/install | bash",
      "install -m 0755 \"$BUN_INSTALL/bin/bun\" /usr/local/bin/bun",
      "mkdir -p /opt/agent-swarm /var/lib/agent-swarm-monitor",
      `cat > /opt/agent-swarm/bootstrap-context.json <<'EOF'\n${JSON.stringify(
        bootstrapPayload,
        null,
        2,
      )}\nEOF`,
      "RUNTIME_REPO_URL=$(jq -r '.runtimeRepoUrl' /opt/agent-swarm/bootstrap-context.json)",
      "RUNTIME_REPO_REF=$(jq -r '.runtimeRepoRef' /opt/agent-swarm/bootstrap-context.json)",
      "if [[ -d /opt/agent-swarm/runtime/.git ]]; then cd /opt/agent-swarm/runtime && git fetch --tags origin && git checkout \"$RUNTIME_REPO_REF\" && git pull --ff-only origin \"$RUNTIME_REPO_REF\"; else rm -rf /opt/agent-swarm/runtime && git clone --branch \"$RUNTIME_REPO_REF\" --single-branch \"$RUNTIME_REPO_URL\" /opt/agent-swarm/runtime; fi",
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
      "cat > /opt/agent-swarm/publish-worker-runtime-release.sh <<'EOF'",
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "cd /opt/agent-swarm/runtime",
      "exec bun run --filter @agent-infrastructure/swarm-manager run:publish-worker-runtime-release -- \"$@\"",
      "EOF",
      "chmod +x /opt/agent-swarm/publish-worker-runtime-release.sh",
      "cat > /opt/agent-swarm/update-runtime.sh <<'EOF'",
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "cd /opt/agent-swarm/runtime",
      "exec bun run --filter @agent-infrastructure/swarm-manager run:update-runtime -- \"$@\"",
      "EOF",
      "chmod +x /opt/agent-swarm/update-runtime.sh",
      "if [[ ! -s /opt/agent-swarm/worker-runtime-release.json ]]; then /opt/agent-swarm/publish-worker-runtime-release.sh --release-id manager-bootstrap; fi",
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
      "RELEASE_CONFIG=/opt/agent-swarm/worker-runtime-release.json",
      "if [[ ! -s \"$RELEASE_CONFIG\" ]]; then echo 'worker runtime release metadata is missing' >&2; exit 1; fi",
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
      "WORKER_RUNTIME_RELEASE_BUCKET=$(jq -r '.bucket' \"$RELEASE_CONFIG\")",
      "WORKER_RUNTIME_RELEASE_KEY=$(jq -r '.key' \"$RELEASE_CONFIG\")",
      "if [[ \"$WORKER_RUNTIME_RELEASE_BUCKET\" == \"null\" || -z \"$WORKER_RUNTIME_RELEASE_BUCKET\" || \"$WORKER_RUNTIME_RELEASE_KEY\" == \"null\" || -z \"$WORKER_RUNTIME_RELEASE_KEY\" ]]; then echo 'worker runtime release metadata is invalid' >&2; exit 1; fi",
      "emit_event() {",
      "  local worker_id=\"$1\"",
      "  local private_ip=\"$2\"",
      "  local event_type=\"$3\"",
      "  local details_json=\"${4:-{}}\"",
      "  local payload",
      "  payload=$(jq -cn \\",
      "    --arg workerId \"$worker_id\" \\",
      "    --arg instanceId \"$worker_id\" \\",
      "    --arg privateIp \"$private_ip\" \\",
      "    --arg nodeRole \"worker\" \\",
      "    --arg eventType \"$event_type\" \\",
      "    --argjson eventTsMs \"$(($(date +%s) * 1000))\" \\",
      "    --argjson details \"$details_json\" \\",
      "    '{workerId:$workerId,instanceId:$instanceId,privateIp:$privateIp,nodeRole:$nodeRole,eventType:$eventType,eventTsMs:$eventTsMs,details:$details}')",
      "  curl -sf -X POST http://127.0.0.1:8787/workers/events \\",
      "    -H 'content-type: application/json' \\",
      "    -H \"x-swarm-token: $SWARM_SHARED_TOKEN\" \\",
      "    -d \"$payload\" >/dev/null || true",
      "}",
      "REQUESTED_AT_MS=$(($(date +%s) * 1000))",
      "TEMP_USER_DATA=$(mktemp)",
      "trap 'rm -f \"$TEMP_USER_DATA\"' EXIT",
      "sed -e \"s/__MANAGER_PRIVATE_IP__/$MANAGER_PRIVATE_IP/g\" -e \"s/__MANAGER_MONITOR_PORT__/$MANAGER_MONITOR_PORT/g\" -e \"s/__SWARM_SHARED_TOKEN__/$SWARM_SHARED_TOKEN/g\" -e \"s/__WORKER_RUNTIME_RELEASE_BUCKET__/$WORKER_RUNTIME_RELEASE_BUCKET/g\" -e \"s#__WORKER_RUNTIME_RELEASE_KEY__#$WORKER_RUNTIME_RELEASE_KEY#g\" -e \"s/__REGION__/$REGION/g\" /opt/agent-swarm/worker-user-data.sh > \"$TEMP_USER_DATA\"",
      "IMAGE_ID=$(aws ec2 describe-images --owners amazon --region \"$REGION\" --filters 'Name=name,Values=al2023-ami-2023.*-x86_64' 'Name=state,Values=available' --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)",
      "emit_event pending pending launch_requested \"{\\\"instanceType\\\":\\\"$INSTANCE_TYPE\\\",\\\"subnetId\\\":\\\"$SUBNET_ID\\\",\\\"requestedAtMs\\\":$REQUESTED_AT_MS}\"",
      "RUN_INSTANCES_OUTPUT=$(aws ec2 run-instances \\",
      "  --region \"$REGION\" \\",
      "  --image-id \"$IMAGE_ID\" \\",
      "  --instance-type \"$INSTANCE_TYPE\" \\",
      "  --iam-instance-profile Arn=\"$INSTANCE_PROFILE_ARN\" \\",
      "  --security-group-ids \"$SECURITY_GROUP_ID\" \\",
      "  --subnet-id \"$SUBNET_ID\" \\",
      "  --user-data file://\"$TEMP_USER_DATA\" \\",
      "  --tag-specifications \"ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Role,Value=agent-swarm-worker},{Key=Name,Value=agent-swarm-worker}]\" \"ResourceType=volume,Tags=[{Key=$TAG_KEY,Value=$TAG_VALUE},{Key=Name,Value=agent-swarm-worker-volume}]\")",
      "INSTANCE_ID=$(printf '%s' \"$RUN_INSTANCES_OUTPUT\" | jq -r '.Instances[0].InstanceId')",
      "PRIVATE_IP=$(printf '%s' \"$RUN_INSTANCES_OUTPUT\" | jq -r '.Instances[0].PrivateIpAddress // \"\"')",
      "emit_event \"$INSTANCE_ID\" \"$PRIVATE_IP\" create \"{\\\"instanceType\\\":\\\"$INSTANCE_TYPE\\\",\\\"subnetId\\\":\\\"$SUBNET_ID\\\",\\\"imageId\\\":\\\"$IMAGE_ID\\\",\\\"requestedAtMs\\\":$REQUESTED_AT_MS}\"",
      "( aws ec2 wait instance-running --region \"$REGION\" --instance-ids \"$INSTANCE_ID\"",
      "  RUNNING_AT_MS=$(($(date +%s) * 1000))",
      "  RUNNING_ELAPSED_SECONDS=$(((RUNNING_AT_MS - REQUESTED_AT_MS) / 1000))",
      "  emit_event \"$INSTANCE_ID\" \"$PRIVATE_IP\" ec2_running \"{\\\"elapsedSeconds\\\":$RUNNING_ELAPSED_SECONDS}\"",
      "  emit_event \"$INSTANCE_ID\" \"$PRIVATE_IP\" launch \"{\\\"runningElapsedSeconds\\\":$RUNNING_ELAPSED_SECONDS}\"",
      "  if aws ec2 wait instance-status-ok --region \"$REGION\" --instance-ids \"$INSTANCE_ID\"; then",
      "    STATUS_OK_AT_MS=$(($(date +%s) * 1000))",
      "    STATUS_OK_ELAPSED_SECONDS=$(((STATUS_OK_AT_MS - REQUESTED_AT_MS) / 1000))",
      "    emit_event \"$INSTANCE_ID\" \"$PRIVATE_IP\" instance_status_ok \"{\\\"elapsedSeconds\\\":$STATUS_OK_ELAPSED_SECONDS}\"",
      "  fi",
      ") >/dev/null 2>&1 & disown",
      "printf '%s\\n' \"$RUN_INSTANCES_OUTPUT\"",
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
    new CfnOutput(this, "WorkerRuntimeReleaseBucketName", {
      value: workerRuntimeReleaseBucket.bucketName,
    });
  }
}
