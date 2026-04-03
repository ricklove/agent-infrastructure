#!/usr/bin/env bun

declare const Bun: {
  spawn(
    args: string[],
    options: { stdout: "pipe"; stderr: "pipe" },
  ): {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
  }
  $: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    quiet(): Promise<unknown>
  }
}
declare const process: {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode?: number
}

type BrowserTestContext = {
  baseUrl: string
  session: string
  screenshotDir: string
}

type BrowserTestCase = {
  name: string
  run(context: BrowserTestContext): Promise<void>
}

const agentBrowserBin =
  process.env.AGENT_BROWSER_BIN?.trim() ||
  "/home/ec2-user/.local/bin/agent-browser"
const baseUrl =
  process.env.AGENT_BROWSER_BASE_URL?.trim() ||
  "http://127.0.0.1:4173/workbench"
const screenshotDir =
  process.env.AGENT_BROWSER_SCREENSHOT_DIR?.trim() ||
  "/home/ec2-user/temp/agent-workbench-ui"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function sanitizeName(value: string) {
  return value
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

function sessionName(testName: string) {
  return `awb-${sanitizeName(testName)}-${Date.now().toString(36)}`
}

function screenshotPath(testName: string) {
  return `${screenshotDir}/${sanitizeName(testName)}.png`
}

async function runAgentBrowser(session: string, args: string[]) {
  const proc = Bun.spawn([agentBrowserBin, "--session", session, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(
      [
        `agent-browser ${args.join(" ")} failed with exit code ${exitCode}`,
        stdout.trim(),
        stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }
  return stdout.trim()
}

async function evalJson<T>(session: string, expression: string): Promise<T> {
  const output = await runAgentBrowser(session, ["get", "eval", expression])
  return JSON.parse(output) as T
}

async function screenshot(session: string, testName: string) {
  await runAgentBrowser(session, ["screenshot", screenshotPath(testName)])
}

async function openWorkbench(session: string) {
  await runAgentBrowser(session, ["close"]).catch(() => undefined)
  await runAgentBrowser(session, ["open", baseUrl])
  await runAgentBrowser(session, ["wait", "1500"])
}

async function getWorkbenchState(session: string) {
  return await evalJson<{
    body: string
    activeTag: string | null
    activePlaceholder: string | null
    inputs: string[]
    menuVisible: boolean
    hasTextOption: boolean
    hasIntOption: boolean
    hasAgentChatOption: boolean
    textareas: string[]
    nodeLabels: string[]
  }>(
    session,
    `JSON.stringify({
      body: document.body.innerText,
      activeTag: document.activeElement?.tagName ?? null,
      activePlaceholder: document.activeElement?.getAttribute?.("placeholder") ?? null,
      inputs: Array.from(document.querySelectorAll("input")).map((element) => element.placeholder || ""),
      menuVisible: document.body.innerText.toLowerCase().includes("search node types"),
      hasTextOption: document.body.innerText.toLowerCase().includes("text"),
      hasIntOption: document.body.innerText.toLowerCase().includes("int"),
      hasAgentChatOption: document.body.innerText.toLowerCase().includes("agent chat"),
      textareas: Array.from(document.querySelectorAll("textarea")).map((element) => element.value),
      nodeLabels: Array.from(document.querySelectorAll("[data-id]")).map((element) => element.getAttribute("data-id") || "")
    })`,
  )
}

async function getEmptyPanePoint(
  session: string,
): Promise<{ clientX: number; clientY: number }> {
  return await evalJson<{ clientX: number; clientY: number }>(
    session,
    `JSON.stringify((() => {
      const pane = document.querySelector(".react-flow__pane");
      if (!(pane instanceof HTMLElement)) {
        throw new Error("react-flow pane not found");
      }
      const rect = pane.getBoundingClientRect();
      const candidatePoints = [
        [rect.left + 40, rect.top + 40],
        [rect.right - 40, rect.top + 40],
        [rect.left + 40, rect.bottom - 40],
        [rect.right - 40, rect.bottom - 40],
        [rect.left + rect.width * 0.2, rect.top + rect.height * 0.2],
        [rect.left + rect.width * 0.8, rect.top + rect.height * 0.2],
        [rect.left + rect.width * 0.2, rect.top + rect.height * 0.8],
        [rect.left + rect.width * 0.8, rect.top + rect.height * 0.8],
      ];
      for (const [clientX, clientY] of candidatePoints) {
        const element = document.elementFromPoint(clientX, clientY);
        if (element instanceof Element && element.closest(".react-flow__pane")) {
          return { clientX, clientY };
        }
      }
      throw new Error("no empty pane point found");
    })())`,
  )
}

async function twoClickPane(session: string) {
  const point = await getEmptyPanePoint(session)
  await runAgentBrowser(session, [
    "two-click-at",
    String(Math.round(point.clientX)),
    String(Math.round(point.clientY)),
    "60",
  ])
  await runAgentBrowser(session, ["wait", "500"])
}

async function doubleClickPane(session: string) {
  const point = await getEmptyPanePoint(session)
  await runAgentBrowser(session, [
    "dblclick-at",
    String(Math.round(point.clientX)),
    String(Math.round(point.clientY)),
  ])
  await runAgentBrowser(session, ["wait", "500"])
}

const tests: BrowserTestCase[] = [
  {
    name: "route-loads",
    async run(context) {
      await openWorkbench(context.session)
      const state = await getWorkbenchState(context.session)
      assert(
        state.body.includes("WORKBENCH FILES"),
        "expected Workbench Files controls to render",
      )
      await screenshot(context.session, "route-loads")
    },
  },
  {
    name: "two-click-opens-add-node-menu",
    async run(context) {
      await openWorkbench(context.session)
      await twoClickPane(context.session)
      const state = await getWorkbenchState(context.session)
      assert(
        state.menuVisible,
        "expected add-node menu to open after two pane clicks",
      )
      assert(
        state.inputs.some(
          (value) => value.toLowerCase() === "search node types",
        ),
        "expected node-type search input",
      )
      await screenshot(context.session, "two-click-opens-add-node-menu")
    },
  },
  {
    name: "double-click-opens-add-node-menu",
    async run(context) {
      await openWorkbench(context.session)
      await doubleClickPane(context.session)
      const state = await getWorkbenchState(context.session)
      assert(state.menuVisible, "expected add-node menu to open after dblclick")
      await screenshot(context.session, "double-click-opens-add-node-menu")
    },
  },
  {
    name: "enter-creates-default-text-node",
    async run(context) {
      await openWorkbench(context.session)
      await twoClickPane(context.session)
      await runAgentBrowser(context.session, ["press", "Enter"])
      await runAgentBrowser(context.session, ["wait", "700"])
      const state = await getWorkbenchState(context.session)
      assert(
        state.textareas.length > 0,
        "expected a text node textarea after pressing Enter on default selection",
      )
      await screenshot(context.session, "enter-creates-default-text-node")
    },
  },
  {
    name: "arrow-down-enter-creates-int-node",
    async run(context) {
      await openWorkbench(context.session)
      await twoClickPane(context.session)
      await runAgentBrowser(context.session, ["press", "ArrowDown"])
      await runAgentBrowser(context.session, ["wait", "200"])
      await runAgentBrowser(context.session, ["press", "Enter"])
      await runAgentBrowser(context.session, ["wait", "700"])
      const state = await getWorkbenchState(context.session)
      assert(
        state.body.toLowerCase().includes("integer"),
        "expected Integer node UI after ArrowDown then Enter",
      )
      await screenshot(context.session, "arrow-down-enter-creates-int-node")
    },
  },
  {
    name: "search-agent-chat-enter-creates-agent-chat-node",
    async run(context) {
      await openWorkbench(context.session)
      await twoClickPane(context.session)
      for (const character of "agent") {
        await runAgentBrowser(context.session, ["press", character])
      }
      await runAgentBrowser(context.session, ["wait", "200"])
      await runAgentBrowser(context.session, ["press", "Enter"])
      await runAgentBrowser(context.session, ["wait", "700"])
      const state = await getWorkbenchState(context.session)
      assert(
        state.body.toLowerCase().includes("agent chat"),
        "expected Agent Chat node UI after searching and pressing Enter",
      )
      await screenshot(
        context.session,
        "search-agent-chat-enter-creates-agent-chat-node",
      )
    },
  },
]

async function main() {
  const requestedNames = process.argv.slice(2).filter(Boolean)
  const selectedTests =
    requestedNames.length === 0
      ? tests
      : tests.filter((entry) => requestedNames.includes(entry.name))

  assert(selectedTests.length > 0, "no matching agent-browser tests selected")

  await Bun.$`mkdir -p ${screenshotDir}`.quiet()

  let failures = 0
  for (const testCase of selectedTests) {
    const context: BrowserTestContext = {
      baseUrl,
      session: sessionName(testCase.name),
      screenshotDir,
    }
    try {
      await testCase.run(context)
      console.log(`PASS ${testCase.name}`)
    } catch (error) {
      failures += 1
      console.error(`FAIL ${testCase.name}`)
      console.error(error instanceof Error ? error.message : String(error))
      try {
        const consoleMessages = await runAgentBrowser(context.session, [
          "get",
          "console",
        ])
        if (consoleMessages) {
          console.error("console:", consoleMessages)
        }
      } catch {
        // ignore console collection failures
      }
      try {
        const pageErrors = await runAgentBrowser(context.session, [
          "get",
          "errors",
        ])
        if (pageErrors) {
          console.error("errors:", pageErrors)
        }
      } catch {
        // ignore page error collection failures
      }
      try {
        await screenshot(context.session, `${testCase.name}-failure`)
      } catch {
        // ignore follow-up screenshot failures
      }
    } finally {
      await runAgentBrowser(context.session, ["close"]).catch(() => undefined)
    }
  }

  if (failures > 0) {
    process.exitCode = 1
  }
}

await main()

export {}
