import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { randomBytes } from "node:crypto";
import {
  DescribeInstancesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

type CredentialRecord = {
  credentialId: string;
  credentialPublicKey: string;
  counter: number;
  transports?: string[];
  credentialDeviceType?: string;
  credentialBackedUp?: boolean;
  createdAtMs: number;
};

type StateRecord = {
  stateId: string;
  kind: "enrollment" | "registration" | "authentication";
  challenge?: string;
  expiresAtMs: number;
  usedAtMs?: number;
};

type JsonBody = Record<string, unknown> | null;

const config = {
  passkeyTableName: process.env.DASHBOARD_PASSKEY_TABLE_NAME ?? "",
  stateTableName: process.env.DASHBOARD_ACCESS_STATE_TABLE_NAME ?? "",
  enrollmentSecret: process.env.DASHBOARD_ENROLLMENT_SECRET ?? "",
  managerSwarmTagValue: process.env.MANAGER_SWARM_TAG_VALUE ?? "",
  agentHome: process.env.AGENT_HOME ?? "",
  dashboardSessionTtlSeconds: Number.parseInt(
    process.env.DASHBOARD_SESSION_TTL_SECONDS ?? "900",
    10,
  ),
};

if (
  !config.passkeyTableName ||
  !config.stateTableName ||
  !config.enrollmentSecret ||
  !config.managerSwarmTagValue ||
  !config.agentHome
) {
  throw new Error("dashboard access lambda is not fully configured");
}

const ec2 = new EC2Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});
let resolvedManagerInstanceId: string | null = null;

function nowMs(): number {
  return Date.now();
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
  };
}

function htmlResponse(html: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: html,
  };
}

function redirectResponse(location: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
    body: "",
  };
}

async function parseJsonBody(event: APIGatewayProxyEventV2): Promise<JsonBody> {
  if (!event.body) {
    return null;
  }

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function randomId(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

function normalizeCredentialId(value: string | Uint8Array): string {
  return typeof value === "string"
    ? value
    : Buffer.from(value).toString("base64url");
}

function getOrigin(event: APIGatewayProxyEventV2): string {
  const host = event.headers.host ?? event.requestContext.domainName ?? "";
  return `https://${host}`;
}

function getRpId(event: APIGatewayProxyEventV2): string {
  return event.headers.host ?? event.requestContext.domainName ?? "";
}

async function putState(record: StateRecord): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: config.stateTableName,
      Item: record,
    }),
  );
}

async function getState(stateId: string): Promise<StateRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: config.stateTableName,
      Key: { stateId },
    }),
  );

  return (response.Item as StateRecord | undefined) ?? null;
}

async function updateState(
  stateId: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const expressions: string[] = [];

  for (const [index, [key, value]] of Object.entries(attributes).entries()) {
    const nameKey = `#n${index}`;
    const valueKey = `:v${index}`;
    names[nameKey] = key;
    values[valueKey] = value;
    expressions.push(`${nameKey} = ${valueKey}`);
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: config.stateTableName,
      Key: { stateId },
      UpdateExpression: `SET ${expressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

async function isEnrollmentTicketValid(ticket: string): Promise<boolean> {
  const ticketState = await getState(ticket);
  return Boolean(
    ticketState &&
      ticketState.kind === "enrollment" &&
      ticketState.expiresAtMs > nowMs() &&
      !ticketState.usedAtMs,
  );
}

async function listCredentials(): Promise<CredentialRecord[]> {
  const response = await dynamo.send(
    new ScanCommand({
      TableName: config.passkeyTableName,
    }),
  );

  return (response.Items as CredentialRecord[] | undefined) ?? [];
}

async function getCredential(credentialId: string): Promise<CredentialRecord | null> {
  const response = await dynamo.send(
    new GetCommand({
      TableName: config.passkeyTableName,
      Key: { credentialId },
    }),
  );

  return (response.Item as CredentialRecord | undefined) ?? null;
}

async function putCredential(record: CredentialRecord): Promise<void> {
  await dynamo.send(
    new PutCommand({
      TableName: config.passkeyTableName,
      Item: record,
    }),
  );
}

async function beginRegistration(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const ticket = typeof body?.ticket === "string" ? body.ticket.trim() : "";
  if (!ticket) {
    return jsonResponse({ ok: false, error: "ticket is required" }, 400);
  }

  const ticketState = await getState(ticket);
  if (
    !ticketState ||
    ticketState.kind !== "enrollment" ||
    ticketState.expiresAtMs <= nowMs() ||
    ticketState.usedAtMs
  ) {
    return jsonResponse({ ok: false, error: "invalid enrollment ticket" }, 401);
  }

  const rpID = getRpId(event);
  const existingCredentials = await listCredentials();
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
  });

  await putState({
    stateId: `registration:${ticket}`,
    kind: "registration",
    challenge: options.challenge,
    expiresAtMs: nowMs() + 5 * 60 * 1000,
  });

  return jsonResponse({
    ok: true,
    options,
  });
}

async function finishRegistration(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const ticket = typeof body?.ticket === "string" ? body.ticket.trim() : "";
  const credential = body?.credential;

  if (!ticket || !credential) {
    return jsonResponse({ ok: false, error: "ticket and credential are required" }, 400);
  }

  const ticketState = await getState(ticket);
  const registrationState = await getState(`registration:${ticket}`);
  if (
    !ticketState ||
    !registrationState ||
    ticketState.kind !== "enrollment" ||
    registrationState.kind !== "registration" ||
    ticketState.expiresAtMs <= nowMs() ||
    registrationState.expiresAtMs <= nowMs() ||
    ticketState.usedAtMs
  ) {
    return jsonResponse({ ok: false, error: "registration ticket is no longer valid" }, 401);
  }

  const verification = await verifyRegistrationResponse({
    response: credential as never,
    expectedChallenge: registrationState.challenge ?? "",
    expectedOrigin: getOrigin(event),
    expectedRPID: getRpId(event),
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse({ ok: false, error: "passkey registration failed" }, 401);
  }

  await putCredential({
    credentialId: normalizeCredentialId(verification.registrationInfo.credential.id),
    credentialPublicKey: Buffer.from(
      verification.registrationInfo.credential.publicKey,
    ).toString("base64url"),
    counter: verification.registrationInfo.credential.counter,
    transports:
      Array.isArray((credential as { response?: { transports?: string[] } }).response?.transports)
        ? ((credential as { response?: { transports?: string[] } }).response
            ?.transports as string[])
        : undefined,
    credentialDeviceType: verification.registrationInfo.credentialDeviceType,
    credentialBackedUp: verification.registrationInfo.credentialBackedUp,
    createdAtMs: nowMs(),
  });
  await updateState(ticket, { usedAtMs: nowMs() });
  await dynamo.send(
    new DeleteCommand({
      TableName: config.stateTableName,
      Key: { stateId: `registration:${ticket}` },
    }),
  );

  return jsonResponse({ ok: true });
}

async function beginAuthentication(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const flowId = `auth:${randomId(18)}`;
  const options = await generateAuthenticationOptions({
    rpID: getRpId(event),
    userVerification: "required",
    allowCredentials: [],
  });

  await putState({
    stateId: flowId,
    kind: "authentication",
    challenge: options.challenge,
    expiresAtMs: nowMs() + 5 * 60 * 1000,
  });

  return jsonResponse({
    ok: true,
    flowId,
    options,
  });
}

async function resolveManagerInstanceId(): Promise<string> {
  if (resolvedManagerInstanceId) {
    return resolvedManagerInstanceId;
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
  );

  const instanceId = response.Reservations?.flatMap((reservation) => reservation.Instances ?? [])
    .map((instance) => instance.InstanceId ?? "")
    .find((value) => value.length > 0);

  if (!instanceId) {
    throw new Error("manager instance was not found");
  }

  resolvedManagerInstanceId = instanceId;
  return instanceId;
}

async function issueDashboardAccess(): Promise<string> {
  const managerInstanceId = await resolveManagerInstanceId();
  const send = await ssm.send(
    new SendCommandCommand({
      InstanceIds: [managerInstanceId],
      DocumentName: "AWS-RunShellScript",
      Parameters: {
        commands: [
          "set -euo pipefail",
          `bash ${config.agentHome}/runtime/issue-dashboard-session.sh --ttl-seconds ${config.dashboardSessionTtlSeconds}`,
        ],
      },
    }),
  );

  const commandId = send.Command?.CommandId;
  if (!commandId) {
    throw new Error("failed to create dashboard session command");
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    let invocation;
    try {
      invocation = await ssm.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: managerInstanceId,
        }),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "InvocationDoesNotExist"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      throw error;
    }

    if (invocation.Status === "Success") {
      const stdout = invocation.StandardOutputContent ?? "";
      const line = stdout
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.startsWith("{") && value.endsWith("}"))
        .at(-1);

      if (!line) {
        throw new Error("dashboard session command did not return JSON");
      }

      const payload = JSON.parse(line) as { sessionUrl?: string };
      if (!payload.sessionUrl) {
        throw new Error("dashboard session URL was missing");
      }

      return payload.sessionUrl;
    }

    if (
      invocation.Status === "Cancelled" ||
      invocation.Status === "Cancelling" ||
      invocation.Status === "Failed" ||
      invocation.Status === "TimedOut"
    ) {
      throw new Error(
        invocation.StandardErrorContent?.trim() || "dashboard session command failed",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("dashboard session command timed out");
}

async function waitForDashboardAccessReady(dashboardUrl: string): Promise<void> {
  const url = new URL(dashboardUrl);
  const readinessUrl = `${url.origin}/api/config`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readinessUrl, {
        method: "GET",
      });

      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("dashboard access URL did not become ready in time");
}

async function finishAuthentication(
  event: APIGatewayProxyEventV2,
  body: JsonBody,
): Promise<APIGatewayProxyStructuredResultV2> {
  const flowId = typeof body?.flowId === "string" ? body.flowId.trim() : "";
  const credential = body?.credential as Record<string, unknown> | undefined;

  if (!flowId || !credential || typeof credential.id !== "string") {
    return jsonResponse({ ok: false, error: "flowId and credential are required" }, 400);
  }

  const authState = await getState(flowId);
  if (
    !authState ||
    authState.kind !== "authentication" ||
    authState.expiresAtMs <= nowMs()
  ) {
    return jsonResponse({ ok: false, error: "authentication session expired" }, 401);
  }

  const credentialRecord = await getCredential(credential.id);
  if (!credentialRecord) {
    return jsonResponse({ ok: false, error: "unknown passkey" }, 401);
  }

  const verification = await verifyAuthenticationResponse({
    response: credential as never,
    expectedChallenge: authState.challenge ?? "",
    expectedOrigin: getOrigin(event),
    expectedRPID: getRpId(event),
    credential: {
      id: credentialRecord.credentialId,
      publicKey: Buffer.from(credentialRecord.credentialPublicKey, "base64url"),
      counter: credentialRecord.counter,
      transports: credentialRecord.transports as never,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return jsonResponse({ ok: false, error: "passkey authentication failed" }, 401);
  }

  await putCredential({
    ...credentialRecord,
    counter: verification.authenticationInfo.newCounter,
  });
  await dynamo.send(
    new DeleteCommand({
      TableName: config.stateTableName,
      Key: { stateId: flowId },
    }),
  );

  const dashboardUrl = await issueDashboardAccess();
  await waitForDashboardAccessReady(dashboardUrl);
  return jsonResponse({
    ok: true,
    dashboardUrl,
  });
}

async function createEnrollmentTicket(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (
    event.headers["x-dashboard-enrollment-secret"] !== config.enrollmentSecret
  ) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }

  const ticket = `enroll:${randomId(18)}`;
  const expiresAtMs = nowMs() + 15 * 60 * 1000;
  await putState({
    stateId: ticket,
    kind: "enrollment",
    expiresAtMs,
  });

  return jsonResponse({
    ok: true,
    registrationUrl: `${getOrigin(event)}/register?ticket=${encodeURIComponent(ticket)}`,
    expiresAtMs,
  });
}

function renderPage(
  mode: "login" | "register",
  registrationTicket = "",
): string {
  const title = mode === "register" ? "Register Passkey" : "Dashboard Access";

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
      .message {
        min-height: 48px;
        margin-top: 16px;
        color: rgba(244,246,247,0.86);
        white-space: pre-wrap;
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
      <div id="message" class="message"></div>
    </main>
    <script type="module">
      const mode = ${JSON.stringify(mode)};
      const registrationTicket = ${JSON.stringify(registrationTicket)};
      const button = document.getElementById("actionButton");
      const message = document.getElementById("message");

      if (mode === "register" && window.location.search) {
        window.history.replaceState({}, "", "/register");
      }

      function setMessage(value) {
        message.textContent = value;
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
          window.location.replace("/");
          return;
        }

        setMessage("Preparing passkey registration...");
        const beginResponse = await fetch("/api/passkeys/register/begin", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ ticket }),
        });
        const beginPayload = await beginResponse.json();
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

        const credential = await navigator.credentials.create({
          publicKey: creationOptionsFromJSON(beginPayload.options),
        });

        const finishResponse = await fetch("/api/passkeys/register/finish", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            ticket,
            credential: credentialToJSON(credential),
          }),
        });
        const finishPayload = await finishResponse.json();
        if (!finishResponse.ok) {
          setMessage(finishPayload.error || "Failed to finish registration.");
          return;
        }

        setMessage("Passkey registered. You can close this tab and use it from your iPhone login flow.");
      }

      async function authenticate() {
        setMessage("Waiting for your passkey...");
        const beginResponse = await fetch("/api/passkeys/auth/begin", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({}),
        });
        const beginPayload = await beginResponse.json();
        if (!beginResponse.ok) {
          setMessage(beginPayload.error || "Failed to start authentication.");
          return;
        }

        const credential = await navigator.credentials.get({
          publicKey: requestOptionsFromJSON(beginPayload.options),
        });

        const finishResponse = await fetch("/api/passkeys/auth/finish", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            flowId: beginPayload.flowId,
            credential: credentialToJSON(credential),
          }),
        });
        const finishPayload = await finishResponse.json();
        if (!finishResponse.ok) {
          setMessage(finishPayload.error || "Failed to authenticate.");
          return;
        }

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
    </script>
  </body>
</html>`;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const path = event.rawPath || "/";
  const method = event.requestContext.http.method;

  if (method === "GET" && path === "/") {
    return htmlResponse(renderPage("login"));
  }

  if (method === "GET" && path === "/register") {
    const ticket = event.queryStringParameters?.ticket?.trim() ?? "";
    if (!ticket || !(await isEnrollmentTicketValid(ticket))) {
      return redirectResponse("/");
    }

    return htmlResponse(renderPage("register", ticket));
  }

  if (method === "POST" && path === "/api/admin/enrollment-ticket") {
    return createEnrollmentTicket(event);
  }

  if (method === "POST" && path === "/api/passkeys/register/begin") {
    return beginRegistration(event, await parseJsonBody(event));
  }

  if (method === "POST" && path === "/api/passkeys/register/finish") {
    return finishRegistration(event, await parseJsonBody(event));
  }

  if (method === "POST" && path === "/api/passkeys/auth/begin") {
    return beginAuthentication(event);
  }

  if (method === "POST" && path === "/api/passkeys/auth/finish") {
    return finishAuthentication(event, await parseJsonBody(event));
  }

  return jsonResponse({ ok: false, error: "not found" }, 404);
}
