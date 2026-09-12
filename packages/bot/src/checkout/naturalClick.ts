import type { Page, Locator } from 'playwright'

// Track last known mouse position per page to allow curved trajectories.
// Playwright starts with mouse at (0,0) and we don't always know where it is,
// but we can track it locally to add realism.
const lastMousePos = new WeakMap<Page, { x: number; y: number }>()

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Bezier curve point between two positions.
 * Returns intermediate point at t∈[0,1] with random curvature.
 */
function bezier(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  controlJitter: number,
): { x: number; y: number } {
  // Random control point offset perpendicular to the travel direction
  const mx = (from.x + to.x) / 2 + rand(-controlJitter, controlJitter)
  const my = (from.y + to.y) / 2 + rand(-controlJitter, controlJitter)
  // Quadratic bezier
  const u = 1 - t
  const x = u * u * from.x + 2 * u * t * mx + t * t * to.x
  const y = u * u * from.y + 2 * u * t * my + t * t * to.y
  return { x, y }
}

/**
 * Move the mouse along a curved bezier path with randomized timing.
 * Simulates human-like trajectory — real users never move in straight lines.
 */
async function curvedMove(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  // Longer distances = more steps + more curvature
  const steps = Math.max(15, Math.min(40, Math.round(distance / 20)))
  const controlJitter = Math.min(distance * 0.3, 120)

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const pt = bezier(from, to, t, controlJitter)
    await page.mouse.move(pt.x, pt.y)
    // Random micro-delay per step (1-8ms) for organic speed variation
    if (i % 3 === 0) await page.waitForTimeout(Math.floor(rand(1, 8)))
  }
}

/**
 * Click a locator with human-like mouse movement.
 *
 * Nike's Kasada detects CDP clicks that teleport directly to the target.
 * Real users:
 *  - Move along curved paths (bezier trajectory)
 *  - Pause before clicking (deciding)
 *  - Have micro-jitter from hand tremor
 *  - Vary click hold time (30-150ms)
 *  - Sometimes scroll before clicking (if element was off-screen)
 *
 * This helper reproduces all of that. Costs 400-800ms per click but bypasses detection.
 */
export async function naturalClick(page: Page, locator: Locator): Promise<void> {
  // Fall back to locator.click() if we can't do natural movement
  // (e.g., mock page in tests, or element without bounding box).
  let box: { x: number; y: number; width: number; height: number } | null = null
  try {
    box = await locator.boundingBox()
  } catch {
    // boundingBox() not available (typical in test mocks)
  }
  if (!box || typeof page.mouse?.move !== 'function') {
    await locator.click()
    return
  }

  // Target a random position within the element (not always center)
  // Real users click anywhere inside the clickable area.
  const targetX = box.x + box.width * rand(0.25, 0.75)
  const targetY = box.y + box.height * rand(0.25, 0.75)

  // Get current mouse position (or start from a random corner if unknown)
  const from = lastMousePos.get(page) ?? {
    x: rand(100, 400),
    y: rand(100, 400),
  }

  // Curved bezier path to target
  await curvedMove(page, from, { x: targetX, y: targetY })
  lastMousePos.set(page, { x: targetX, y: targetY })

  // Pre-click decision pause (users look at target briefly before clicking)
  await page.waitForTimeout(Math.floor(rand(80, 220)))

  // Micro-jitter: hand tremor before clicking
  const jitterX = targetX + rand(-2, 2)
  const jitterY = targetY + rand(-1, 1)
  await page.mouse.move(jitterX, jitterY)
  await page.waitForTimeout(Math.floor(rand(20, 80)))

  // The mouse cursor is now hovering over the element (with realistic trajectory
  // for telemetry). But we do NOT fire mouse.down/up — Nike's Kasada intercepts
  // those at the window level and calls preventDefault(), blocking React handlers.
  //
  // Instead, fire element.click() via evaluate. This triggers the target's onClick
  // handler DIRECTLY without going through the window event bubble chain, bypassing
  // Kasada's interceptor. Since we already moved the mouse to hover-position, the
  // browser's mouseover/mouseenter events have fired, matching what a real user does.
  try {
    await locator.evaluate((el) => (el as HTMLElement).click())
  } catch {
    // Element may be detached — fall back to Playwright click
    try { await locator.click({ force: true, timeout: 2000 }) } catch {}
  }
}

/**
 * Random idle pause — simulates human reading/thinking.
 * Use between major actions (navigation, form fills, etc).
 */
export async function humanPause(page: Page, minMs = 400, maxMs = 1400): Promise<void> {
  await page.waitForTimeout(Math.floor(rand(minMs, maxMs)))
}

/**
 * Random scroll to mimic browsing behavior.
 * Real users scroll the page to see content — pure automation often doesn't.
 */
export async function humanScroll(page: Page, direction: 'down' | 'up' = 'down'): Promise<void> {
  const amount = Math.floor(rand(100, 400)) * (direction === 'up' ? -1 : 1)
  await page.mouse.wheel(0, amount)
  await page.waitForTimeout(Math.floor(rand(200, 500)))
}
