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

type WorkbenchNodeSnapshot = {
  id: string
  type: string
  width?: number
  height?: number
}

type WorkbenchSnapshot = {
  ok: true
  workbench: {
    id: string
    nodes: WorkbenchNodeSnapshot[]
  }
}

const agentBrowserBin =
  process.env.AGENT_BROWSER_BIN?.trim() ||
  "/home/ec2-user/.nvm/versions/node/v24.14.0/bin/agent-browser"
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

function workbenchApiUrl() {
  const url = new URL(baseUrl)
  url.pathname = "/api/agent-workbench/workbench"
  url.search = ""
  return url.toString()
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
  const output = await runAgentBrowser(session, ["eval", expression])
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

async function fetchWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
  const response = await fetch(workbenchApiUrl())
  if (!response.ok) {
    throw new Error(
      `workbench api request failed with ${response.status}: ${await response.text()}`,
    )
  }
  return (await response.json()) as WorkbenchSnapshot
}

async function persistWorkbenchSnapshot(snapshot: WorkbenchSnapshot["workbench"]) {
  const url = new URL(workbenchApiUrl())
  url.searchParams.set("id", snapshot.id)
  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  })
  if (!response.ok) {
    throw new Error(
      `workbench api save failed with ${response.status}: ${await response.text()}`,
    )
  }
  return (await response.json()) as WorkbenchSnapshot
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

async function createNodeFromMenu(session: string, keys: string[]) {
  const before = await fetchWorkbenchSnapshot()
  await twoClickPane(session)
  for (const key of keys) {
    await runAgentBrowser(session, ["press", key])
    await runAgentBrowser(session, ["wait", key.length === 1 ? "80" : "120"])
  }
  await runAgentBrowser(session, ["wait", "900"])
  const after = await fetchWorkbenchSnapshot()
  const previousIds = new Set(before.workbench.nodes.map((node) => node.id))
  const createdNode = after.workbench.nodes.find((node) => !previousIds.has(node.id))
  assert(createdNode, "expected a newly created workbench node")
  return createdNode
}

async function getResizeHandleCount(session: string) {
  return await evalJson<number>(
    session,
    `JSON.stringify(document.querySelectorAll(".react-flow__resize-control").length)`,
  )
}

async function resizeNodeByStyle(
  session: string,
  nodeId: string,
  width: number,
  height: number,
) {
  await runAgentBrowser(session, [
    "eval",
    `(() => {
      const outer = document.querySelector('.react-flow__node[data-id="${nodeId}"]');
      if (!(outer instanceof HTMLElement)) {
        throw new Error("target node not found");
      }
      const inner = outer.lastElementChild;
      outer.style.width = "${width}px";
      outer.style.height = "${height}px";
      if (inner instanceof HTMLElement) {
        inner.style.width = "100%";
        inner.style.height = "100%";
      }
      return JSON.stringify({
        outer: outer.getBoundingClientRect(),
        inner: inner instanceof HTMLElement ? inner.getBoundingClientRect() : null,
      });
    })()`,
  ])
  await runAgentBrowser(session, ["wait", "1800"])
}

async function setFirstTextareaValue(session: string, value: string) {
  await runAgentBrowser(session, [
    "eval",
    `(() => {
      const textarea = document.querySelector("textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("textarea not found");
      }
      textarea.focus();
      textarea.value = ${JSON.stringify(value)};
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    })()`,
  ])
  await runAgentBrowser(session, ["wait", "1200"])
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
  {
    name: "text-node-shows-resize-handles",
    async run(context) {
      await openWorkbench(context.session)
      await createNodeFromMenu(context.session, ["Enter"])
      const handleCount = await getResizeHandleCount(context.session)
      assert(handleCount >= 8, "expected resize handles on text node")
      await screenshot(context.session, "text-node-shows-resize-handles")
    },
  },
  {
    name: "int-node-shows-resize-handles",
    async run(context) {
      await openWorkbench(context.session)
      await createNodeFromMenu(context.session, ["ArrowDown", "Enter"])
      const handleCount = await getResizeHandleCount(context.session)
      assert(handleCount >= 8, "expected resize handles on int node")
      await screenshot(context.session, "int-node-shows-resize-handles")
    },
  },
  {
    name: "agent-chat-node-shows-resize-handles",
    async run(context) {
      await openWorkbench(context.session)
      const createdNode = await createNodeFromMenu(context.session, [
        "a",
        "g",
        "e",
        "n",
        "t",
        "Enter",
      ])
      assert(createdNode.type === "agent-chat", "expected agent-chat node to be created")
      const handleCount = await getResizeHandleCount(context.session)
      assert(handleCount >= 8, "expected resize handles on agent-chat node")
      await screenshot(context.session, "agent-chat-node-shows-resize-handles")
    },
  },
  {
    name: "int-node-resize-persists-dimensions",
    async run(context) {
      await openWorkbench(context.session)
      const createdNode = await createNodeFromMenu(context.session, [
        "ArrowDown",
        "Enter",
      ])
      assert(createdNode.type === "int", "expected created node to be int")
      await resizeNodeByStyle(context.session, createdNode.id, 220, 80)
      const afterResize = await fetchWorkbenchSnapshot()
      const resizedNode = afterResize.workbench.nodes.find(
        (node) => node.id === createdNode.id,
      )
      assert(resizedNode, "expected resized int node in workbench snapshot")
      assert(resizedNode.width === 220, `expected persisted width 220, got ${resizedNode.width}`)
      assert(resizedNode.height === 80, `expected persisted height 80, got ${resizedNode.height}`)

      await openWorkbench(context.session)
      const afterReload = await fetchWorkbenchSnapshot()
      const reloadedNode = afterReload.workbench.nodes.find(
        (node) => node.id === createdNode.id,
      )
      assert(reloadedNode, "expected resized int node after reload")
      assert(reloadedNode.width === 220, `expected reloaded width 220, got ${reloadedNode.width}`)
      assert(reloadedNode.height === 80, `expected reloaded height 80, got ${reloadedNode.height}`)
      await screenshot(context.session, "int-node-resize-persists-dimensions")
    },
  },
  {
    name: "corrupt-zero-dimensions-are-cleared-on-next-save",
    async run(context) {
      await openWorkbench(context.session)
      const createdNode = await createNodeFromMenu(context.session, ["Enter"])
      assert(createdNode.type === "text", "expected created node to be text")

      const initialSnapshot = await fetchWorkbenchSnapshot()
      const corruptedNodes = initialSnapshot.workbench.nodes.map((node) =>
        node.id === createdNode.id ? { ...node, width: 0, height: 0 } : node,
      )
      await persistWorkbenchSnapshot({
        ...initialSnapshot.workbench,
        nodes: corruptedNodes,
      })

      await openWorkbench(context.session)
      const loadedSnapshot = await fetchWorkbenchSnapshot()
      const loadedNode = loadedSnapshot.workbench.nodes.find(
        (node) => node.id === createdNode.id,
      )
      assert(loadedNode, "expected corrupted text node after reload")
      assert(loadedNode.width === 0, `expected corrupted width 0 before save, got ${loadedNode.width}`)
      assert(loadedNode.height === 0, `expected corrupted height 0 before save, got ${loadedNode.height}`)

      await setFirstTextareaValue(context.session, "normalized after reload")

      const afterEdit = await fetchWorkbenchSnapshot()
      const savedNode = afterEdit.workbench.nodes.find(
        (node) => node.id === createdNode.id,
      )
      assert(savedNode, "expected text node after save")
      assert(savedNode.width === undefined, `expected width to be cleared, got ${savedNode.width}`)
      assert(savedNode.height === undefined, `expected height to be cleared, got ${savedNode.height}`)
      await screenshot(
        context.session,
        "corrupt-zero-dimensions-are-cleared-on-next-save",
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
          "console",
        ])
        if (consoleMessages) {
          console.error("console:", consoleMessages)
        }
      } catch {
      }
      try {
        const pageErrors = await runAgentBrowser(context.session, ["errors"])
        if (pageErrors) {
          console.error("errors:", pageErrors)
        }
      } catch {
      }
      try {
        await screenshot(context.session, `${testCase.name}-failure`)
      } catch {
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
