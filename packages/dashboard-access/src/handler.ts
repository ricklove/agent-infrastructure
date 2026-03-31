import { randomBytes } from "node:crypto"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DescribeInstancesCommand,
  EC2Client,
  RebootInstancesCommand,
} from "@aws-sdk/client-ec2"
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager"
import {
  GetCommandInvocationCommand,
  type GetCommandInvocationCommandOutput,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm"
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda"

type CredentialRecord = {
  credentialId: string
  credentialPublicKey: string
  counter: number
  transports?: string[]
  credentialDeviceType?: string
  credentialBackedUp?: boolean
  createdAtMs: number
}

type StateRecord = {
  stateId: string
  kind:
    | "enrollment"
    | "registration"
    | "authentication"
    | "authentication-status"
  challenge?: string
  expiresAtMs: number
  usedAtMs?: number
  progressStep?: string
  progressMessage?: string
  progressDetail?: Record<string, unknown> | null
  failureStep?: string
  error?: string
  dashboardUrl?: string
}

type JsonBody = Record<string, unknown> | null

const config = {
  passkeyTableName: process.env.DASHBOARD_PASSKEY_TABLE_NAME ?? "",
  stateTableName: process.env.DASHBOARD_ACCESS_STATE_TABLE_NAME ?? "",
  enrollmentSecretSecretName:
    process.env.DASHBOARD_ENROLLMENT_SECRET_SECRET_NAME ?? "",
  managerSwarmTagValue: process.env.MANAGER_SWARM_TAG_VALUE ?? "",
  agentHome: process.env.AGENT_HOME ?? "",
  dashboardSessionTtlSeconds: Number.parseInt(
    process.env.DASHBOARD_SESSION_TTL_SECONDS ?? "900",
    10,
  ),
}

if (
  !config.passkeyTableName ||
  !config.stateTableName ||
  !config.enrollmentSecretSecretName ||
  !config.managerSwarmTagValue ||
  !config.agentHome
) {
  throw new Error("dashboard access lambda is not fully configured")
}

const ec2 = new EC2Client({})
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ssm = new SSMClient({})
const secrets = new SecretsManagerClient({})
let resolvedManagerInstanceId: string | null = null
let resolvedEnrollmentSecretPromise: Promise<string> | null = null

function logAuthStep(step: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`[dashboard-access] ${step}`, detail)
    return
  }
  console.log(`[dashboard-access] ${step}`)
}

function errorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    error: String(error),
  }
}

function nowMs(): number {
  return Date.now()
}

async function getEnrollmentSecret(): Promise<string> {
  if (!resolvedEnrollmentSecretPromise) {
    resolvedEnrollmentSecretPromise = (async () => {
      const response = await secrets.send(
        new GetSecretValueCommand({
          SecretId: config.enrollmentSecretSecretName,
        }),
      )
      const secret = response.SecretString?.trim() || ""
      if (!secret) {
        throw new Error("dashboard enrollment secret is empty")
      }
      return secret
    })()
  }

  return resolvedEnrollmentSecretPromise
}

function jsonResponse(
  body: unknown,
  statusCode = 200,
  extraHeaders?: Record<string, string>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

function htmlResponse(html: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: html,
  }
}

function redirectResponse(location: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
    body: "",
  }
}

async function parseJsonBody(event: APIGatewayProxyEventV2): Promise<JsonBody> {
  if (!event.body) {
    return null
  }

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function randomId(bytes = 24): string {
  return randomBytes(bytes).toString("hex")
}

function authStatusStateId(flowId: string): string {
  return `auth-status:${flowId}`
}

function normalizeCredentialId(value: string | Uint8Array): string {
  return typeof value === "string"
    ? value
    : Buffer.from(value).toString("base64url")
}

function getOrigin(event: APIGatewayProxyEventV2): string {
  const host = event.headers.host ?? event.requestContext.domainName ?? ""
  return `https://${host}`
}

function getRpId(event: APIGatewayProxyEventV2): string {
  return event.headers.host ?? event.requestContext.domainName ?? ""
}

async function putState(record: StateRecord): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: config.stateTableName,
      Item: record,
    }),
  )
}

async function getState(stateId: string): Promise<StateRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: config.stateTableName,
      Key: { stateId },
    }),
  )

  return (response.Item as StateRecord | undefined) ?? null
}

async function updateState(
  stateId: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  const expressions: string[] = []

  for (const [index, [key, value]] of Object.entries(attributes).entries()) {
    const nameKey = `#n${index}`
    const valueKey = `:v${index}`
    names[nameKey] = key
    values[valueKey] = value
    expressions.push(`${nameKey} = ${valueKey}`)
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: config.stateTableName,
      Key: { stateId },
      UpdateExpression: `SET ${expressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  )
}

async function putAuthStatus(
  flowId: string,
  attributes: Partial<StateRecord>,
): Promise<void> {
  const currentTime = nowMs()
  const current = await getState(authStatusStateId(flowId))
  await putState({
    stateId: authStatusStateId(flowId),
    kind: "authentication-status",
    expiresAtMs: current?.expiresAtMs ?? currentTime + 10 * 60 * 1000,
    ...(current ?? {}),
    ...attributes,
  })
}

async function getAuthStatus(flowId: string): Promise<StateRecord | null> {
  const record = await getState(authStatusStateId(flowId))
  if (
    !record ||
    record.kind !== "authentication-status" ||
    record.expiresAtMs <= nowMs()
  ) {
    return null
  }

  return record
}

function canUseRecoveryAction(status: StateRecord | null): boolean {
  if (
    !status ||
    status.kind !== "authentication-status" ||
    status.expiresAtMs <= nowMs()
  ) {
    return false
  }

  const allowedSteps = new Set([
    "auth.finish.verified",
    "auth.finish.credential.update.started",
    "auth.finish.credential.update.completed",
    "auth.finish.state.delete.started",
    "auth.finish.state.delete.completed",
    "auth.finish.dashboard-session.started",
    "auth.finish.dashboard-session.url.received",
    "auth.finish.dashboard-session.readiness.started",
    "auth.finish.completed",
    "auth.finish.error",
    "admin.reboot.requested",
    "admin.reboot.completed",
  ])

  return allowedSteps.has(status.progressStep ?? "")
}

async function isEnrollmentTicketValid(ticket: string): Promise<boolean> {
  const ticketState = await getState(ticket)
  return Boolean(
    ticketState &&
      ticketState.kind === "enrollment" &&
      ticketState.expiresAtMs > nowMs() &&
      !ticketState.usedAtMs,
  )
}

async function listCredentials(): Promise<CredentialRecord[]> {
  const response = await dynamo.send(
    new ScanCommand({
      TableName: config.passkeyTableName,
    }),
  )

  return (response.Items as CredentialRecord[] | undefined) ?? []
}

async function getCredential(
  credentialId: string,
): Promise<CredentialRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: config.passkeyTableName,
      Key: { credentialId },
    }),
  )

  return (response.Item as CredentialRecord | undefined) ?? null
}

async function putCredential(record: CredentialRecord): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: config.passkeyTableName,
      Item: record,
    }),
  )
}

async function beginRegistration(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  logAuthStep("register.begin.requested", {
    hasTicket:
      typeof body?.ticket === "string" && body.ticket.trim().length > 0,
  })
  const ticket = typeof body?.ticket === "string" ? body.ticket.trim() : ""
  if (!ticket) {
    logAuthStep("register.begin.rejected", { reason: "missing-ticket" })
    return jsonResponse({ ok: false, error: "ticket is required" }, 400)
  }

  const ticketState = await getState(ticket)
  if (
    !ticketState ||
    ticketState.kind !== "enrollment" ||
    ticketState.expiresAtMs <= nowMs() ||
    ticketState.usedAtMs
  ) {
    logAuthStep("register.begin.rejected", { reason: "invalid-ticket" })
    return jsonResponse({ ok: false, error: "invalid enrollment ticket" }, 401)
  }

  const rpID = getRpId(event)
  const existingCredentials = await listCredentials()
  const options = await generateRegistrationOptions({
    rpName: "Agent Infrastructure Dashboard",
    rpID,
    userID: new TextEncoder().encode("agent-infrastructure-dashboard"),
    userName: "agent-infrastructure-dashboard",
    userDisplayName: "Agent Infrastructure Dashboard",
    attestationType: "none",
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as never,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  })

  await putState({
    stateId: `registration:${ticket}`,
    kind: "registration",
    challenge: options.challenge,
    expiresAtMs: nowMs() + 5 * 60 * 1000,
  })

  logAuthStep("register.begin.ready", {
    rpId: rpID,
    excludedCredentialCount: existingCredentials.length,
  })

  return jsonResponse({
    ok: true,
    options,
  })
}

async function finishRegistration(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  logAuthStep("register.finish.requested", {
    hasTicket:
      typeof body?.ticket === "string" && body.ticket.trim().length > 0,
    hasCredential: Boolean(body?.credential),
  })
  const ticket = typeof body?.ticket === "string" ? body.ticket.trim() : ""
  const credential = body?.credential

  if (!ticket || !credential) {
    logAuthStep("register.finish.rejected", {
      reason: "missing-ticket-or-credential",
    })
    return jsonResponse(
      { ok: false, error: "ticket and credential are required" },
      400,
    )
  }

  const ticketState = await getState(ticket)
  const registrationState = await getState(`registration:${ticket}`)
  if (
    !ticketState ||
    !registrationState ||
    ticketState.kind !== "enrollment" ||
    registrationState.kind !== "registration" ||
    ticketState.expiresAtMs <= nowMs() ||
    registrationState.expiresAtMs <= nowMs() ||
    ticketState.usedAtMs
  ) {
    logAuthStep("register.finish.rejected", {
      reason: "registration-ticket-invalid",
    })
    return jsonResponse(
      { ok: false, error: "registration ticket is no longer valid" },
      401,
    )
  }

  const verification = await verifyRegistrationResponse({
    response: credential as never,
    expectedChallenge: registrationState.challenge ?? "",
    expectedOrigin: getOrigin(event),
    expectedRPID: getRpId(event),
    requireUserVerification: true,
  })

  if (!verification.verified || !verification.registrationInfo) {
    logAuthStep("register.finish.rejected", { reason: "verification-failed" })
    return jsonResponse(
      { ok: false, error: "passkey registration failed" },
      401,
    )
  }

  await putCredential({
    credentialId: normalizeCredentialId(
      verification.registrationInfo.credential.id,
    ),
    credentialPublicKey: Buffer.from(
      verification.registrationInfo.credential.publicKey,
    ).toString("base64url"),
    counter: verification.registrationInfo.credential.counter,
    transports: Array.isArray(
      (credential as { response?: { transports?: string[] } }).response
        ?.transports,
    )
      ? ((credential as { response?: { transports?: string[] } }).response
          ?.transports as string[])
      : undefined,
    credentialDeviceType: verification.registrationInfo.credentialDeviceType,
    credentialBackedUp: verification.registrationInfo.credentialBackedUp,
    createdAtMs: nowMs(),
  })
  await updateState(ticket, { usedAtMs: nowMs() })
  await dynamo.send(
    new DeleteCommand({
      TableName: config.stateTableName,
      Key: { stateId: `registration:${ticket}` },
    }),
  )

  logAuthStep("register.finish.completed", {
    credentialId: normalizeCredentialId(
      verification.registrationInfo.credential.id,
    ),
  })

  return jsonResponse({ ok: true })
}

async function beginAuthentication(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  logAuthStep("auth.begin.requested", {
    rpId: getRpId(event),
    origin: getOrigin(event),
  })
  const flowId = `auth:${randomId(18)}`
  const options = await generateAuthenticationOptions({
    rpID: getRpId(event),
    userVerification: "required",
    allowCredentials: [],
  })

  await putState({
    stateId: flowId,
    kind: "authentication",
    challenge: options.challenge,
    expiresAtMs: nowMs() + 5 * 60 * 1000,
  })
  await putAuthStatus(flowId, {
    progressStep: "auth.begin.ready",
    progressMessage: "Passkey challenge created.",
    progressDetail: { flowId },
    error: undefined,
    failureStep: undefined,
    dashboardUrl: undefined,
  })

  logAuthStep("auth.begin.ready", { flowId })

  return jsonResponse({
    ok: true,
    flowId,
    options,
  })
}

async function resolveManagerInstanceId(): Promise<string> {
  if (resolvedManagerInstanceId) {
    return resolvedManagerInstanceId
  }

  const response = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:AgentSwarm",
          Values: [config.managerSwarmTagValue],
        },
        {
          Name: "tag:Role",
          Values: ["agent-swarm-manager"],
        },
        {
          Name: "instance-state-name",
          Values: ["pending", "running", "stopping", "stopped"],
        },
      ],
    }),
  )

  const instanceId = response.Reservations?.flatMap(
    (reservation) => reservation.Instances ?? [],
  )
    .map((instance) => instance.InstanceId ?? "")
    .find((value) => value.length > 0)

  if (!instanceId) {
    throw new Error("manager instance was not found")
  }

  resolvedManagerInstanceId = instanceId
  return instanceId
}

async function issueDashboardAccess(): Promise<string> {
  return runDashboardSessionCommand(
    "issue-dashboard-session.sh",
    "auth.finish.dashboard-session.issue",
  )
}

async function rebootManager(
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const flowId = typeof body?.flowId === "string" ? body.flowId.trim() : ""
  if (!flowId) {
    return jsonResponse({ ok: false, error: "flowId is required" }, 400)
  }

  const status = await getAuthStatus(flowId)
  if (!canUseRecoveryAction(status)) {
    logAuthStep("admin.reboot.rejected", {
      reason: "recovery-not-authorized",
      flowId,
    })
    return jsonResponse(
      { ok: false, error: "recovery action is not authorized" },
      403,
    )
  }

  const managerInstanceId = await resolveManagerInstanceId()
  logAuthStep("admin.reboot.requested", { flowId, managerInstanceId })
  await putAuthStatus(flowId, {
    progressStep: "admin.reboot.requested",
    progressMessage: "Reboot requested for the manager instance.",
    progressDetail: { flowId, managerInstanceId },
    error: undefined,
  })

  await ec2.send(
    new RebootInstancesCommand({
      InstanceIds: [managerInstanceId],
    }),
  )

  logAuthStep("admin.reboot.completed", { flowId, managerInstanceId })
  await putAuthStatus(flowId, {
    progressStep: "admin.reboot.completed",
    progressMessage:
      "Manager reboot requested. Wait for recovery, then try again.",
    progressDetail: { flowId, managerInstanceId },
  })

  return jsonResponse({
    ok: true,
    managerInstanceId,
    message: "Manager reboot requested.",
  })
}

function shellToken(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

async function runDashboardSessionCommand(
  scriptName: string,
  logPrefix: string,
  extraArgs: string[] = [],
  extraDetail?: Record<string, unknown>,
): Promise<string> {
  logAuthStep(`${logPrefix}.requested`, extraDetail)
  const managerInstanceId = await resolveManagerInstanceId()
  logAuthStep(`${logPrefix}.manager.resolved`, {
    managerInstanceId,
    ...extraDetail,
  })
  const send = await ssm.send(
    new SendCommandCommand({
      InstanceIds: [managerInstanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [
          "set -euo pipefail",
          [
            `bash ${config.agentHome}/runtime/scripts/${scriptName}`,
            "--ttl-seconds",
            String(config.dashboardSessionTtlSeconds),
            ...extraArgs.map((value) =>
              value.startsWith("--") ? value : shellToken(value),
            ),
          ].join(" "),
        ],
      },
    }),
  )

  const commandId = send.Command?.CommandId
  if (!commandId) {
    logAuthStep(`${logPrefix}.failed`, {
      reason: "missing-command-id",
      ...extraDetail,
    })
    throw new Error("failed to create dashboard session command")
  }

  logAuthStep(`${logPrefix}.command.sent`, { commandId, ...extraDetail })

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    let invocation: GetCommandInvocationCommandOutput
    try {
      invocation = await ssm.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: managerInstanceId,
        }),
      )
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "InvocationDoesNotExist"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }

      throw error
    }

    if (invocation.Status === "Success") {
      const stdout = invocation.StandardOutputContent ?? ""
      const line = stdout
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.startsWith("{") && value.endsWith("}"))
        .at(-1)

      if (!line) {
        logAuthStep(`${logPrefix}.failed`, {
          reason: "missing-json-output",
          ...extraDetail,
        })
        throw new Error("dashboard session command did not return JSON")
      }

      const payload = JSON.parse(line) as { sessionUrl?: string }
      if (!payload.sessionUrl) {
        logAuthStep(`${logPrefix}.failed`, {
          reason: "missing-session-url",
          ...extraDetail,
        })
        throw new Error("dashboard session URL was missing")
      }

      logAuthStep(`${logPrefix}.issued`, {
        sessionUrl: payload.sessionUrl,
        ...extraDetail,
      })

      return payload.sessionUrl
    }

    if (
      invocation.Status === "Cancelled" ||
      invocation.Status === "Cancelling" ||
      invocation.Status === "Failed" ||
      invocation.Status === "TimedOut"
    ) {
      logAuthStep(`${logPrefix}.failed`, {
        reason: invocation.Status ?? "unknown-status",
        ...extraDetail,
      })
      throw new Error(
        invocation.StandardErrorContent?.trim() ||
          "dashboard session command failed",
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  logAuthStep(`${logPrefix}.failed`, { reason: "timeout", ...extraDetail })
  throw new Error("dashboard session command timed out")
}

async function waitForDashboardAccessReady(
  dashboardUrl: string,
): Promise<void> {
  logAuthStep("auth.finish.dashboard-session.readiness.waiting", {
    dashboardUrl,
  })
  const url = new URL(dashboardUrl)
  const readinessUrl = `${url.origin}/api/config`
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readinessUrl, {
        method: "GET",
      })

      if (response.ok) {
        logAuthStep("auth.finish.dashboard-session.readiness.ready", {
          dashboardUrl,
        })
        return
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  logAuthStep("auth.finish.dashboard-session.readiness.failed", {
    reason: "timeout",
  })
  throw new Error("dashboard access URL did not become ready in time")
}

async function finishAuthentication(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  logAuthStep("auth.finish.requested", {
    hasFlowId:
      typeof body?.flowId === "string" && body.flowId.trim().length > 0,
    hasCredential: Boolean(body?.credential),
    credentialId:
      body?.credential &&
      typeof (body.credential as Record<string, unknown>).id === "string"
        ? (body.credential as Record<string, unknown>).id
        : null,
  })
  const flowId = typeof body?.flowId === "string" ? body.flowId.trim() : ""
  const credential = body?.credential as Record<string, unknown> | undefined

  if (!flowId || !credential || typeof credential.id !== "string") {
    logAuthStep("auth.finish.rejected", {
      reason: "missing-flow-or-credential",
    })
    return jsonResponse(
      { ok: false, error: "flowId and credential are required" },
      400,
    )
  }

  const authState = await getState(flowId)
  if (
    !authState ||
    authState.kind !== "authentication" ||
    authState.expiresAtMs <= nowMs()
  ) {
    logAuthStep("auth.finish.rejected", {
      reason: "authentication-session-expired",
      flowId,
    })
    return jsonResponse(
      { ok: false, error: "authentication session expired" },
      401,
    )
  }

  const credentialRecord = await getCredential(credential.id)
  if (!credentialRecord) {
    logAuthStep("auth.finish.rejected", {
      reason: "unknown-passkey",
      credentialId: credential.id,
    })
    return jsonResponse({ ok: false, error: "unknown passkey" }, 401)
  }

  let failureStep = "verification"
  try {
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.verification.started",
      progressMessage: "Verifying the passkey response.",
      progressDetail: {
        credentialId: credential.id,
        expectedOrigin: getOrigin(event),
        expectedRpId: getRpId(event),
        storedCounter: credentialRecord.counter,
      },
      error: undefined,
      failureStep: undefined,
      dashboardUrl: undefined,
    })
    logAuthStep("auth.finish.verification.started", {
      flowId,
      credentialId: credential.id,
      expectedOrigin: getOrigin(event),
      expectedRpId: getRpId(event),
      storedCounter: credentialRecord.counter,
    })

    const verification = await verifyAuthenticationResponse({
      response: credential as never,
      expectedChallenge: authState.challenge ?? "",
      expectedOrigin: getOrigin(event),
      expectedRPID: getRpId(event),
      credential: {
        id: credentialRecord.credentialId,
        publicKey: Buffer.from(
          credentialRecord.credentialPublicKey,
          "base64url",
        ),
        counter: credentialRecord.counter,
        transports: credentialRecord.transports as never,
      },
      requireUserVerification: true,
    })

    if (!verification.verified) {
      logAuthStep("auth.finish.rejected", {
        reason: "verification-failed",
        flowId,
      })
      return jsonResponse(
        { ok: false, error: "passkey authentication failed" },
        401,
      )
    }

    logAuthStep("auth.finish.verified", {
      flowId,
      credentialId: credential.id,
      newCounter: verification.authenticationInfo.newCounter,
    })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.verified",
      progressMessage: "Passkey verified.",
      progressDetail: {
        credentialId: credential.id,
        newCounter: verification.authenticationInfo.newCounter,
      },
    })

    logAuthStep("auth.finish.credential.update.started", {
      flowId,
      credentialId: credential.id,
      newCounter: verification.authenticationInfo.newCounter,
    })
    failureStep = "credential.update"
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.credential.update.started",
      progressMessage: "Updating credential counter.",
      progressDetail: {
        credentialId: credential.id,
        newCounter: verification.authenticationInfo.newCounter,
      },
    })
    await putCredential({
      ...credentialRecord,
      counter: verification.authenticationInfo.newCounter,
    })
    logAuthStep("auth.finish.credential.update.completed", {
      flowId,
      credentialId: credential.id,
    })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.credential.update.completed",
      progressMessage: "Credential counter updated.",
      progressDetail: {
        credentialId: credential.id,
      },
    })

    logAuthStep("auth.finish.state.delete.started", { flowId })
    failureStep = "state.delete"
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.state.delete.started",
      progressMessage: "Clearing authentication flow state.",
      progressDetail: { flowId },
    })
    await dynamo.send(
      new DeleteCommand({
        TableName: config.stateTableName,
        Key: { stateId: flowId },
      }),
    )
    logAuthStep("auth.finish.state.delete.completed", { flowId })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.state.delete.completed",
      progressMessage: "Authentication flow state cleared.",
      progressDetail: { flowId },
    })

    logAuthStep("auth.finish.dashboard-session.started", { flowId })
    failureStep = "dashboard.session.issue"
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.dashboard-session.started",
      progressMessage: "Requesting dashboard session from manager.",
      progressDetail: { flowId },
    })
    const dashboardUrl = await issueDashboardAccess()
    logAuthStep("auth.finish.dashboard-session.url.received", {
      flowId,
      dashboardUrl,
    })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.dashboard-session.url.received",
      progressMessage: "Dashboard session URL received.",
      progressDetail: { flowId, dashboardUrl },
      dashboardUrl,
    })

    failureStep = "dashboard.session.readiness"
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.dashboard-session.readiness.started",
      progressMessage: "Waiting for dashboard readiness.",
      progressDetail: { flowId, dashboardUrl },
      dashboardUrl,
    })
    await waitForDashboardAccessReady(dashboardUrl)
    logAuthStep("auth.finish.completed", { flowId, dashboardUrl })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.completed",
      progressMessage: "Authentication complete.",
      progressDetail: { flowId, dashboardUrl },
      dashboardUrl,
    })
    return jsonResponse({
      ok: true,
      dashboardUrl,
    })
  } catch (error) {
    logAuthStep("auth.finish.error", {
      flowId,
      credentialId: credential.id,
      failureStep,
      ...errorDetail(error),
    })
    await putAuthStatus(flowId, {
      progressStep: "auth.finish.error",
      progressMessage: "Authentication failed.",
      progressDetail: {
        flowId,
        credentialId: credential.id,
        ...errorDetail(error),
      },
      failureStep,
      error:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "authentication failed",
    })
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "authentication failed",
        failureStep,
      },
      500,
    )
  }
}

async function createEnrollmentTicket(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const enrollmentSecret = await getEnrollmentSecret()
  if (event.headers["x-dashboard-enrollment-secret"] !== enrollmentSecret) {
    logAuthStep("enrollment-ticket.rejected", { reason: "forbidden" })
    return jsonResponse({ ok: false, error: "forbidden" }, 403)
  }

  const ticket = `enroll:${randomId(18)}`
  const expiresAtMs = nowMs() + 15 * 60 * 1000
  await putState({
    stateId: ticket,
    kind: "enrollment",
    expiresAtMs,
  })

  logAuthStep("enrollment-ticket.created", { ticket, expiresAtMs })

  return jsonResponse({
    ok: true,
    registrationUrl: `${getOrigin(event)}/register?ticket=${encodeURIComponent(ticket)}`,
    expiresAtMs,
  })
}

function renderPage(
  mode: "login" | "register",
  registrationTicket = "",
): string {
  const title = mode === "register" ? "Register Passkey" : "Dashboard Access"

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color: #f4f6f7;
        background:
          radial-gradient(circle at top left, rgba(120, 196, 154, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(218, 122, 74, 0.16), transparent 24%),
          linear-gradient(180deg, #0f1419 0%, #131a22 100%);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
      .shell {
        width: min(540px, calc(100vw - 24px));
        padding: 28px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 24px;
        background: rgba(13, 17, 22, 0.84);
        box-shadow: 0 20px 70px rgba(0,0,0,0.26);
      }
      .eyebrow {
        margin: 0 0 10px;
        color: #83dbac;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.76rem;
        font-weight: 700;
      }
      h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); letter-spacing: -0.05em; }
      p { color: rgba(244,246,247,0.74); line-height: 1.6; }
      button {
        border: none;
        border-radius: 999px;
        padding: 13px 18px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        color: #06100b;
        background: linear-gradient(135deg, #8de2ac 0%, #d4f39f 100%);
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 18px;
      }
      .actions button.secondary {
        color: #d8efe1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
      }
      .message {
        min-height: 48px;
        margin-top: 16px;
        color: rgba(244,246,247,0.86);
        white-space: pre-wrap;
      }
      .steps {
        margin-top: 18px;
        padding: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        background: rgba(255,255,255,0.04);
      }
      .steps h2 {
        margin: 0 0 10px;
        font-size: 0.82rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.56);
      }
      .steps ol {
        margin: 0;
        padding-left: 18px;
        color: rgba(216, 239, 225, 0.92);
        font-size: 0.93rem;
        line-height: 1.55;
      }
      .steps li + li {
        margin-top: 8px;
      }
      .steps code {
        margin-top: 6px;
        font-size: 0.78rem;
        color: #c9efe0;
      }
      code {
        display: block;
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255,255,255,0.06);
        color: #d8efe1;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">Agent Infrastructure</p>
      <h1>${title}</h1>
      <p>${
        mode === "register"
          ? "Use the one-time enrollment link from the dashboard to register a passkey for this public access origin."
          : "Authenticate with your passkey. On success, this page will redirect into a one-time dashboard access URL."
      }</p>
      <button id="actionButton">${
        mode === "register" ? "Register Passkey" : "Sign In With Passkey"
      }</button>
      <div class="actions">
        <button id="copyHistoryButton" type="button" class="secondary">Copy History</button>
        <button id="rebootManagerButton" type="button" class="secondary" hidden>Reboot Manager</button>
      </div>
      <div id="message" class="message"></div>
      <section class="steps">
        <h2>Auth Steps</h2>
        <ol id="stepLog"></ol>
      </section>
    </main>
    <script type="module">
      const mode = ${JSON.stringify(mode)};
      const registrationTicket = ${JSON.stringify(registrationTicket)};
      const button = document.getElementById("actionButton");
      const copyHistoryButton = document.getElementById("copyHistoryButton");
      const rebootManagerButton = document.getElementById("rebootManagerButton");
      const message = document.getElementById("message");
      const stepLog = document.getElementById("stepLog");
      const uiHistory = [];
      let latestFlowId = "";

      if (mode === "register" && window.location.search) {
        window.history.replaceState({}, "", "/register");
      }

      function setMessage(value) {
        message.textContent = value;
      }

      function pushStep(step, detail) {
        const record = {
          at: new Date().toISOString(),
          step,
          detail: detail ?? null,
        };
        uiHistory.push(record);
        const entry = document.createElement("li");
        const summary = document.createElement("div");
        summary.textContent = step;
        entry.appendChild(summary);
        if (detail !== undefined) {
          const detailCode = document.createElement("code");
          detailCode.textContent = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
          entry.appendChild(detailCode);
        }
        stepLog.appendChild(entry);
        console.log("[dashboard-access-ui]", record);
      }

      async function copyHistory() {
        const payload = JSON.stringify(uiHistory, null, 2);
        try {
          await navigator.clipboard.writeText(payload);
          setMessage("Copied auth history to clipboard.");
        } catch {
          setMessage("Failed to copy auth history to clipboard.");
        }
      }

      function showRebootButton() {
        rebootManagerButton.hidden = false;
      }

      function hideRebootButton() {
        rebootManagerButton.hidden = true;
      }

      async function rebootManager() {
        if (!latestFlowId) {
          setMessage("No authenticated recovery flow is available yet.");
          return;
        }

        if (!window.confirm("Reboot the manager instance now?")) {
          return;
        }

        pushStep("admin.reboot.requested", { flowId: latestFlowId });
        setMessage("Requesting manager reboot...");
        const response = await fetch("/api/admin/reboot-manager", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ flowId: latestFlowId }),
        });
        const payload = await readJsonSafely(response);
        pushStep("admin.reboot.response", { status: response.status, payload });
        if (!response.ok) {
          setMessage(formatErrorMessage(payload, "Failed to request manager reboot."));
          return;
        }

        setMessage(payload?.message || "Manager reboot requested. Wait for recovery, then try again.");
      }

      function formatErrorMessage(payload, fallback) {
        if (payload && typeof payload === "object") {
          const message = typeof payload.error === "string" ? payload.error : fallback;
          const failureStep = typeof payload.failureStep === "string" ? payload.failureStep : "";
          return failureStep ? message + " (step: " + failureStep + ")" : message;
        }
        return fallback;
      }

      async function readJsonSafely(response) {
        const text = await response.text();
        if (!text) {
          return null;
        }

        try {
          return JSON.parse(text);
        } catch {
          return { ok: false, error: text };
        }
      }

      async function fetchAuthStatus(flowId) {
        const response = await fetch("/api/passkeys/auth/status?flowId=" + encodeURIComponent(flowId), {
          method: "GET",
          headers: { "cache-control": "no-store" },
        });
        return {
          response,
          payload: await readJsonSafely(response),
        };
      }

      function base64urlToBuffer(base64url) {
        const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const binary = atob(padded);
        return Uint8Array.from(binary, (char) => char.charCodeAt(0));
      }

      function bufferToBase64url(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = "";
        bytes.forEach((value) => {
          binary += String.fromCharCode(value);
        });
        return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      }

      function creationOptionsFromJSON(options) {
        return {
          ...options,
          challenge: base64urlToBuffer(options.challenge),
          user: {
            ...options.user,
            id: base64urlToBuffer(options.user.id),
          },
          excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
            ...credential,
            id: base64urlToBuffer(credential.id),
          })),
        };
      }

      function requestOptionsFromJSON(options) {
        return {
          ...options,
          challenge: base64urlToBuffer(options.challenge),
          allowCredentials: (options.allowCredentials || []).map((credential) => ({
            ...credential,
            id: base64urlToBuffer(credential.id),
          })),
        };
      }

      function credentialToJSON(credential) {
        const response = credential.response;
        if ("attestationObject" in response) {
          return {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
              attestationObject: bufferToBase64url(response.attestationObject),
              clientDataJSON: bufferToBase64url(response.clientDataJSON),
              transports: typeof response.getTransports === "function"
                ? response.getTransports()
                : [],
            },
          };
        }

        return {
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            authenticatorData: bufferToBase64url(response.authenticatorData),
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle
              ? bufferToBase64url(response.userHandle)
              : null,
          },
        };
      }

      async function registerPasskey() {
        const ticket = registrationTicket;
        if (!ticket) {
          pushStep("register.redirect.no-ticket");
          window.location.replace("/");
          return;
        }

        pushStep("register.begin.requested", { ticket });
        setMessage("Preparing passkey registration...");
        const beginResponse = await fetch("/api/passkeys/register/begin", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ticket }),
        });
        const beginPayload = await beginResponse.json();
        pushStep("register.begin.response", { status: beginResponse.status, payload: beginPayload });
        if (!beginResponse.ok) {
          if (
            beginResponse.status === 401 &&
            (beginPayload.error || "").includes("ticket")
          ) {
            window.location.replace("/");
            return;
          }

          setMessage(beginPayload.error || "Failed to start registration.");
          return;
        }

        pushStep("register.browser.credentials.create.start");
        const credential = await navigator.credentials.create({
          publicKey: creationOptionsFromJSON(beginPayload.options),
        });
        pushStep("register.browser.credentials.create.success", { id: credential.id, type: credential.type });

        const finishResponse = await fetch("/api/passkeys/register/finish", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            ticket,
            credential: credentialToJSON(credential),
          }),
        });
        const finishPayload = await finishResponse.json();
        pushStep("register.finish.response", { status: finishResponse.status, payload: finishPayload });
        if (!finishResponse.ok) {
          setMessage(finishPayload.error || "Failed to finish registration.");
          return;
        }

        setMessage("Passkey registered. You can close this tab and use it from your iPhone login flow.");
      }

      async function authenticate() {
        pushStep("auth.begin.requested");
        hideRebootButton();
        setMessage("Waiting for your passkey...");
        const beginResponse = await fetch("/api/passkeys/auth/begin", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({}),
        });
        const beginPayload = await beginResponse.json();
        pushStep("auth.begin.response", { status: beginResponse.status, payload: beginPayload });
        if (!beginResponse.ok) {
          setMessage(beginPayload.error || "Failed to start authentication.");
          return;
        }
        latestFlowId = beginPayload.flowId || "";

        let credential;
        try {
          pushStep("auth.browser.credentials.get.start", {
            flowId: beginPayload.flowId,
            rpId: beginPayload.options?.rpId,
          });
          credential = await navigator.credentials.get({
            publicKey: requestOptionsFromJSON(beginPayload.options),
          });
          pushStep("auth.browser.credentials.get.success", {
            id: credential?.id ?? null,
            type: credential?.type ?? null,
          });
        } catch (error) {
          pushStep("auth.browser.credentials.get.error", {
            name: error?.name ?? null,
            message: error?.message ?? String(error),
          });
          setMessage(error?.message || "Passkey request failed before authentication could finish.");
          return;
        }

        pushStep("auth.finish.requested", { flowId: beginPayload.flowId, credentialId: credential.id });
        setMessage("Finishing authentication with the server...");
        let stopStatusPolling = false;
        let lastProgressStep = "";
        const statusPoller = (async () => {
          while (!stopStatusPolling) {
            try {
              const { response, payload } = await fetchAuthStatus(beginPayload.flowId);
              if (
                response.ok &&
                payload &&
                typeof payload.progressStep === "string" &&
                payload.progressStep !== lastProgressStep
              ) {
                lastProgressStep = payload.progressStep;
                pushStep(payload.progressStep, payload.progressDetail ?? null);
                if (typeof payload.progressMessage === "string" && payload.progressMessage.length > 0) {
                  setMessage(payload.progressMessage);
                }
              }
            } catch (error) {
              console.log("[dashboard-access-ui]", {
                at: new Date().toISOString(),
                step: "auth.finish.status.poll.error",
                detail: {
                  message: error?.message ?? String(error),
                },
              });
            }

            await new Promise((resolve) => window.setTimeout(resolve, 500));
          }
        })();
        const finishResponse = await fetch("/api/passkeys/auth/finish", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            flowId: beginPayload.flowId,
            credential: credentialToJSON(credential),
          }),
        });
        stopStatusPolling = true;
        await statusPoller;
        const finishPayload = await readJsonSafely(finishResponse);
        pushStep("auth.finish.response", { status: finishResponse.status, payload: finishPayload });
        if (!finishResponse.ok) {
          const errorMessage = formatErrorMessage(finishPayload, "Failed to authenticate.");
          pushStep("auth.finish.failed", {
            status: finishResponse.status,
            error: finishPayload?.error ?? null,
            failureStep: finishPayload?.failureStep ?? null,
          });
          if (
            finishResponse.status >= 500 ||
            finishPayload?.failureStep === "dashboard.session.issue" ||
            finishPayload?.failureStep === "dashboard.session.readiness"
          ) {
            showRebootButton();
          }
          setMessage(errorMessage);
          return;
        }

        pushStep("auth.redirect.dashboard", { dashboardUrl: finishPayload.dashboardUrl });
        setMessage("Access granted. Waiting for the dashboard link to become ready...");
        window.location.href = finishPayload.dashboardUrl;
      }

      button.addEventListener("click", () => {
        if (mode === "register") {
          void registerPasskey();
          return;
        }

        void authenticate();
      });
      copyHistoryButton.addEventListener("click", () => {
        void copyHistory();
      });
      rebootManagerButton.addEventListener("click", () => {
        void rebootManager();
      });
    </script>
  </body>
</html>`
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const path = event.rawPath || "/"
  const method = event.requestContext.http.method

  if (method === "GET" && path === "/") {
    return htmlResponse(renderPage("login"))
  }

  if (method === "GET" && path === "/register") {
    const ticket = event.queryStringParameters?.ticket?.trim() ?? ""
    if (!ticket || !(await isEnrollmentTicketValid(ticket))) {
      return redirectResponse("/")
    }

    return htmlResponse(renderPage("register", ticket))
  }

  if (method === "POST" && path === "/api/admin/enrollment-ticket") {
    return createEnrollmentTicket(event)
  }

  if (method === "POST" && path === "/api/admin/reboot-manager") {
    return rebootManager(await parseJsonBody(event))
  }

  if (method === "POST" && path === "/api/passkeys/register/begin") {
    return beginRegistration(event, await parseJsonBody(event))
  }

  if (method === "POST" && path === "/api/passkeys/register/finish") {
    return finishRegistration(event, await parseJsonBody(event))
  }

  if (method === "POST" && path === "/api/passkeys/auth/begin") {
    return beginAuthentication(event)
  }

  if (method === "POST" && path === "/api/passkeys/auth/finish") {
    return finishAuthentication(event, await parseJsonBody(event))
  }

  if (method === "GET" && path === "/api/passkeys/auth/status") {
    const flowId = event.queryStringParameters?.flowId?.trim() ?? ""
    if (!flowId) {
      return jsonResponse({ ok: false, error: "flowId is required" }, 400)
    }

    const status = await getAuthStatus(flowId)
    if (!status) {
      return jsonResponse({ ok: false, error: "status not found" }, 404)
    }

    return jsonResponse({
      ok: true,
      progressStep: status.progressStep ?? null,
      progressMessage: status.progressMessage ?? null,
      progressDetail: status.progressDetail ?? null,
      failureStep: status.failureStep ?? null,
      error: status.error ?? null,
      dashboardUrl: status.dashboardUrl ?? null,
    })
  }

  return jsonResponse({ ok: false, error: "not found" }, 404)
}
