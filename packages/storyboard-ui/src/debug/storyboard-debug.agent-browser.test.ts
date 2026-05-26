#!/usr/bin/env bun
/// <reference types="node" />

import { mkdirSync, writeFileSync } from "fs"
import { resolve } from "path"
import {
  findStoryboardDebugComponent,
  storyboardDebugComponents,
  storyboardDebugComponentArtifactPath,
  storyboardDebugScenarioArtifactPath,
} from "./registry"

declare const Bun: {
  spawn(
    args: string[],
    options: {
      stdout: "pipe"
      stderr: "pipe"
      cwd?: string
      env?: Record<string, string>
    },
  ): {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill(): void
  }
  sleep(ms: number): Promise<void>
}
declare const process: {
  env: Record<string, string | undefined>
  exitCode?: number
}

const workspaceRoot =
  process.env.STORYBOARD_WORKSPACE_ROOT?.trim() ||
  "/home/ec2-user/workspace/projects/ricklove-agent-infrastructure"
const appRoot = resolve(workspaceRoot, "apps/dashboard-app")
const publicArtifactRoot = resolve(appRoot, "public/storyboard-debug")
const htmlArtifactRoot = resolve(
  workspaceRoot,
  "packages/storyboard-ui/debug-artifacts/html",
)
const baseUrl =
  process.env.STORYBOARD_DEBUG_BASE_URL?.trim() ||
  "http://127.0.0.1:4174"
function getPanZoomComponent() {
  const component = findStoryboardDebugComponent("panZoomContainer")
  if (!component) {
    throw new Error("missing panZoomContainer debug definition")
  }
  return component
}

const BOARD_WIDTH = 3200
const BOARD_HEIGHT = 2200
const BOARD_PADDING = 24
const TEN_PERCENT_SCALE = 0.1
const VIEW_EPSILON = 0.02
const ANCHOR_EPSILON = 0.5

function htmlDocument(body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Storyboard Debug Snapshot</title>
  </head>
  <body>${body}</body>
</html>`
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

async function waitForHttp(url: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
    }
    await Bun.sleep(500)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function startDashboardApp() {
  const proc = Bun.spawn(
    ["bun", "run", "dev", "--", "--host", "127.0.0.1", "--port", "4174"],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        BUN_TMPDIR: process.env.BUN_TMPDIR || "/home/ec2-user/tmp/bun-tmp",
        BUN_INSTALL: process.env.BUN_INSTALL || "/home/ec2-user/tmp/bun-install",
      } as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  try {
    await waitForHttp(`${baseUrl}/storyboard/debug/`)
  } catch (error) {
    proc.kill()
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        stdout.trim(),
        stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }
  return proc
}

async function createBrowser() {
  const playwright = (await (0, eval)('import("playwright")')) as {
    chromium: {
      launch(): Promise<{
        newPage(options: {
          viewport: { width: number; height: number }
        }): Promise<{
          goto(url: string, options: { waitUntil: "networkidle" }): Promise<void>
          waitForTimeout(ms: number): Promise<void>
          evaluate<T, A>(
            fn: (arg: A) => T | Promise<T>,
            arg: A,
          ): Promise<T>
          locator(selector: string): {
            click(): Promise<void>
            screenshot(options: { path: string }): Promise<void>
          }
          mouse: {
            move(x: number, y: number): Promise<void>
            wheel(deltaX: number, deltaY: number): Promise<void>
          }
          close(): Promise<void>
        }>
        close(): Promise<void>
      }>
    }
  }
  return playwright.chromium.launch()
}

async function captureScenarioArtifact(
  browser: Awaited<ReturnType<typeof createBrowser>>,
  scenarioSlug: string,
  outputPaths: { pngPath?: string; htmlPath?: string },
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  })
  try {
    await page.goto(
      `${baseUrl}/storyboard/debug/panZoomContainer/${scenarioSlug}/`,
      { waitUntil: "networkidle" },
    )
    await page.waitForTimeout(180)

    if (outputPaths.pngPath) {
      await page
        .locator('[data-storyboard-debug-capture-root="true"]')
        .screenshot({ path: outputPaths.pngPath })
    }

    if (outputPaths.htmlPath) {
      const body = await page.evaluate(() => {
        const captureRoot = document.querySelector(
          '[data-storyboard-debug-capture-root="true"]',
        )
        return captureRoot?.outerHTML ?? document.body.outerHTML
      }, undefined)
      writeFileSync(outputPaths.htmlPath, htmlDocument(body))
    }
  } finally {
    await page.close()
  }
}

async function captureDebugScenarioArtifact(
  browser: Awaited<ReturnType<typeof createBrowser>>,
  componentSlug: string,
  scenarioSlug: string,
  outputPaths: { pngPath?: string; htmlPath?: string },
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  })
  try {
    await page.goto(
      `${baseUrl}/storyboard/debug/${componentSlug}/${scenarioSlug}/`,
      { waitUntil: "networkidle" },
    )
    await page.waitForTimeout(180)

    if (outputPaths.pngPath) {
      await page
        .locator('[data-storyboard-debug-capture-root="true"]')
        .screenshot({ path: outputPaths.pngPath })
    }

    if (outputPaths.htmlPath) {
      const body = await page.evaluate(() => {
        const captureRoot = document.querySelector(
          '[data-storyboard-debug-capture-root="true"]',
        )
        return captureRoot?.outerHTML ?? document.body.outerHTML
      }, undefined)
      writeFileSync(outputPaths.htmlPath, htmlDocument(body))
    }
  } finally {
    await page.close()
  }
}

async function writeArtifacts() {
  const browser = await createBrowser()
  try {
    for (const component of storyboardDebugComponents) {
      const componentDir = resolve(publicArtifactRoot, component.slug)
      const htmlComponentDir = resolve(htmlArtifactRoot, component.slug)
      ensureDir(componentDir)
      ensureDir(htmlComponentDir)

      await captureDebugScenarioArtifact(
        browser,
        component.slug,
        component.defaultScenarioSlug,
        {
          pngPath: resolve(componentDir, "component.png"),
          htmlPath: resolve(htmlComponentDir, "component.html"),
        },
      )

      for (const scenario of component.scenarios) {
        await captureDebugScenarioArtifact(
          browser,
          component.slug,
          scenario.slug,
          {
            pngPath: resolve(componentDir, `${scenario.slug}.png`),
            htmlPath: resolve(htmlComponentDir, `${scenario.slug}.html`),
          },
        )
      }
    }
  } finally {
    await browser.close()
  }
}

function assertClose(
  actual: number,
  expected: number,
  epsilon: number,
  message: string,
) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`)
  }
}

async function verifyScenarioLayout(
  page: {
    evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
  },
  scenarioSlug: string,
) {
  const layout = await page.evaluate(() => {
    const viewport = document.querySelector('[data-panzoom-viewport="true"]')
    const stage = document.querySelector('[data-panzoom-stage="true"]')
    const squares = [...document.querySelectorAll("[data-color-target]")]
    if (!(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
      return null
    }

    const viewportRect = viewport.getBoundingClientRect()
    const squareRects = squares.map((square) => {
      const rect = square.getBoundingClientRect()
      return {
        key: square.getAttribute("data-color-target") ?? "unknown",
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    })

    return {
      viewportWidth: viewportRect.width,
      viewportHeight: viewportRect.height,
      scale: Number(stage.getAttribute("data-panzoom-scale") ?? "NaN"),
      offsetX: Number(stage.getAttribute("data-panzoom-offset-x") ?? "NaN"),
      offsetY: Number(stage.getAttribute("data-panzoom-offset-y") ?? "NaN"),
      squareRects,
    }
  }, undefined)

  if (!layout) {
    throw new Error(`missing pan/zoom layout for ${scenarioSlug}`)
  }

  for (const square of layout.squareRects) {
    if (square.width <= 0 || square.height <= 0) {
      throw new Error(`square ${square.key} did not render in ${scenarioSlug}`)
    }
    if (
      square.right <= 0 ||
      square.bottom <= 0 ||
      square.left >= layout.viewportWidth ||
      square.top >= layout.viewportHeight
    ) {
      throw new Error(`square ${square.key} is outside the viewport in ${scenarioSlug}`)
    }
  }

  if (scenarioSlug === "red-green-blue-squares-fit") {
    const expectedScale = Math.min(
      (layout.viewportWidth - BOARD_PADDING * 2) / BOARD_WIDTH,
      (layout.viewportHeight - BOARD_PADDING * 2) / BOARD_HEIGHT,
    )
    assertClose(layout.scale, expectedScale, VIEW_EPSILON, "fit scale mismatch")
    assertClose(
      layout.offsetX,
      (layout.viewportWidth - BOARD_WIDTH * expectedScale) / 2,
      1,
      "fit offsetX mismatch",
    )
    assertClose(
      layout.offsetY,
      (layout.viewportHeight - BOARD_HEIGHT * expectedScale) / 2,
      1,
      "fit offsetY mismatch",
    )
    return
  }

  assertClose(
    layout.scale,
    TEN_PERCENT_SCALE,
    VIEW_EPSILON,
    `${scenarioSlug} scale mismatch`,
  )

  if (scenarioSlug === "red-green-blue-squares-10-centered") {
    assertClose(
      layout.offsetX,
      (layout.viewportWidth - BOARD_WIDTH * TEN_PERCENT_SCALE) / 2,
      1,
      "10% centered offsetX mismatch",
    )
    assertClose(
      layout.offsetY,
      (layout.viewportHeight - BOARD_HEIGHT * TEN_PERCENT_SCALE) / 2,
      1,
      "10% centered offsetY mismatch",
    )
    return
  }

  assertClose(layout.offsetX, BOARD_PADDING, 1, "10% top-left offsetX mismatch")
  assertClose(layout.offsetY, BOARD_PADDING, 1, "10% top-left offsetY mismatch")
}

async function verifyWheelAnchor(
  page: {
    waitForTimeout(ms: number): Promise<void>
    evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>
    locator(selector: string): { click(): Promise<void> }
    mouse: { move(x: number, y: number): Promise<void>; wheel(deltaX: number, deltaY: number): Promise<void> }
  },
  scenarioSlug: string,
) {
  const targets = ["red", "green", "blue"] as const

  for (const target of targets) {
    await page.locator(`[data-panzoom-focus-target="${target}"]`).click()
    await page.waitForTimeout(120)

    const before = await page.evaluate(() => {
      const viewport = document.querySelector('[data-panzoom-viewport="true"]')
      const stage = document.querySelector('[data-panzoom-stage="true"]')
      if (!(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
        return null
      }

      const viewportRect = viewport.getBoundingClientRect()
      const point = {
        x: viewportRect.left + viewportRect.width / 2,
        y: viewportRect.top + viewportRect.height / 2,
      }
      const local = {
        x: point.x - viewportRect.left,
        y: point.y - viewportRect.top,
      }
      const scale = Number(stage.getAttribute("data-panzoom-scale") ?? "NaN")
      const offsetX = Number(stage.getAttribute("data-panzoom-offset-x") ?? "NaN")
      const offsetY = Number(stage.getAttribute("data-panzoom-offset-y") ?? "NaN")

      return {
        point,
        scale,
        boardX: (local.x - offsetX) / scale,
        boardY: (local.y - offsetY) / scale,
        target:
          document
            .elementFromPoint(point.x, point.y)
            ?.closest("[data-color-target]")
            ?.getAttribute("data-color-target") ?? null,
      }
    }, undefined)

    if (!before) {
      throw new Error(`missing anchor point for ${target} on ${scenarioSlug}`)
    }
    if (before.target !== target) {
      throw new Error(
        `wrong target before zoom on ${scenarioSlug}: expected ${target}, got ${String(before.target)}`,
      )
    }

    await page.mouse.move(before.point.x, before.point.y)
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(120)

    const afterZoomIn = await page.evaluate((point) => {
      const viewport = document.querySelector('[data-panzoom-viewport="true"]')
      const stage = document.querySelector('[data-panzoom-stage="true"]')
      if (!(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
        return null
      }
      const viewportRect = viewport.getBoundingClientRect()
      const local = {
        x: point.x - viewportRect.left,
        y: point.y - viewportRect.top,
      }
      const scale = Number(stage.getAttribute("data-panzoom-scale") ?? "NaN")
      const offsetX = Number(stage.getAttribute("data-panzoom-offset-x") ?? "NaN")
      const offsetY = Number(stage.getAttribute("data-panzoom-offset-y") ?? "NaN")
      return {
        boardX: (local.x - offsetX) / scale,
        boardY: (local.y - offsetY) / scale,
        target:
          document
            .elementFromPoint(point.x, point.y)
            ?.closest("[data-color-target]")
            ?.getAttribute("data-color-target") ?? null,
      }
    }, before.point)

    if (!afterZoomIn) {
      throw new Error(`missing zoom-in measurement for ${target} on ${scenarioSlug}`)
    }
    if (afterZoomIn.target !== target) {
      throw new Error(
        `anchor drift after zoom in on ${scenarioSlug}: expected ${target}, got ${String(afterZoomIn.target)}`,
      )
    }
    assertClose(
      afterZoomIn.boardX,
      before.boardX,
      ANCHOR_EPSILON,
      `boardX drift after zoom in for ${target} on ${scenarioSlug}`,
    )
    assertClose(
      afterZoomIn.boardY,
      before.boardY,
      ANCHOR_EPSILON,
      `boardY drift after zoom in for ${target} on ${scenarioSlug}`,
    )

    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(120)

    const afterZoomOut = await page.evaluate((point) => {
      const viewport = document.querySelector('[data-panzoom-viewport="true"]')
      const stage = document.querySelector('[data-panzoom-stage="true"]')
      if (!(viewport instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
        return null
      }
      const viewportRect = viewport.getBoundingClientRect()
      const local = {
        x: point.x - viewportRect.left,
        y: point.y - viewportRect.top,
      }
      const scale = Number(stage.getAttribute("data-panzoom-scale") ?? "NaN")
      const offsetX = Number(stage.getAttribute("data-panzoom-offset-x") ?? "NaN")
      const offsetY = Number(stage.getAttribute("data-panzoom-offset-y") ?? "NaN")
      return {
        boardX: (local.x - offsetX) / scale,
        boardY: (local.y - offsetY) / scale,
        target:
          document
            .elementFromPoint(point.x, point.y)
            ?.closest("[data-color-target]")
            ?.getAttribute("data-color-target") ?? null,
      }
    }, before.point)

    if (!afterZoomOut) {
      throw new Error(`missing zoom-out measurement for ${target} on ${scenarioSlug}`)
    }
    if (afterZoomOut.target !== target) {
      throw new Error(
        `anchor drift after zoom out on ${scenarioSlug}: expected ${target}, got ${String(afterZoomOut.target)}`,
      )
    }
    assertClose(
      afterZoomOut.boardX,
      before.boardX,
      ANCHOR_EPSILON,
      `boardX drift after zoom out for ${target} on ${scenarioSlug}`,
    )
    assertClose(
      afterZoomOut.boardY,
      before.boardY,
      ANCHOR_EPSILON,
      `boardY drift after zoom out for ${target} on ${scenarioSlug}`,
    )
  }
}

async function verifyPanZoomInteraction() {
  const browser = await createBrowser()
  const scenarios = [
    "red-green-blue-squares-fit",
    "red-green-blue-squares-10-centered",
    "red-green-blue-squares-10-top-left",
  ] as const

  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1024 },
      })
      await page.goto(
        `${baseUrl}/storyboard/debug/panZoomContainer/${scenario}/`,
        { waitUntil: "networkidle" },
      )
      await page.waitForTimeout(180)
      await verifyScenarioLayout(page, scenario)
      await verifyWheelAnchor(page, scenario)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  ensureDir(publicArtifactRoot)
  ensureDir(htmlArtifactRoot)
  const proc = await startDashboardApp()
  try {
    await writeArtifacts()
    await verifyPanZoomInteraction()
    for (const component of storyboardDebugComponents) {
      console.log(
        `${component.slug}: ${storyboardDebugComponentArtifactPath(component.slug)}`,
      )
      for (const scenario of component.scenarios) {
        console.log(
          `  ${scenario.slug}: ${storyboardDebugScenarioArtifactPath(
            component.slug,
            scenario.slug,
          )}`,
        )
      }
    }
  } finally {
    proc.kill()
  }
}

await main()
