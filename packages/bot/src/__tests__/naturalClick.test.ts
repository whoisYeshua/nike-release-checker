import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'
import type { Page, Locator } from 'playwright'

import { naturalClick, humanPause, humanScroll } from '../checkout/naturalClick.ts'

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

type MouseLog = Array<{ action: 'move' | 'wheel'; x?: number; y?: number; deltaX?: number; deltaY?: number }>

interface MockLocatorResult {
  locator: Locator
  counter: { clicks: number; evaluates: number }
}

function makeMockLocator(opts: {
  boundingBox?: { x: number; y: number; width: number; height: number } | null
  clickSpy?: () => void
  evaluateSpy?: () => void
  boundingBoxThrows?: boolean
}): MockLocatorResult {
  const { boundingBox = null, clickSpy, evaluateSpy, boundingBoxThrows = false } = opts
  const counter = { clicks: 0, evaluates: 0 }

  const locator = {
    boundingBox: async () => {
      if (boundingBoxThrows) throw new Error('No bounding box')
      return boundingBox
    },
    click: async () => {
      counter.clicks++
      clickSpy?.()
    },
    evaluate: async (_fn: Function) => {
      counter.evaluates++
      evaluateSpy?.()
    },
  } as unknown as Locator

  return { locator, counter }
}

function makeMockPage(opts: {
  mouseLog?: MouseLog
  hasMouseMove?: boolean
  timeouts?: number[]
}): Page {
  const { mouseLog = [], hasMouseMove = true, timeouts = [] } = opts
  let timeoutIdx = 0

  const mouse = hasMouseMove
    ? {
        move: async (x: number, y: number) => { mouseLog.push({ action: 'move', x, y }) },
        wheel: async (deltaX: number, deltaY: number) => { mouseLog.push({ action: 'wheel', deltaX, deltaY }) },
      }
    : undefined

  return {
    mouse,
    waitForTimeout: async (_ms: number) => {
      if (timeouts) timeouts[timeoutIdx++] = _ms
    },
  } as unknown as Page
}

// ---------------------------------------------------------------------------
// naturalClick
// ---------------------------------------------------------------------------

describe('naturalClick', () => {
  it('falls back to locator.click() when boundingBox() returns null', async () => {
    const { locator, counter } = makeMockLocator({ boundingBox: null })
    const page = makeMockPage({})
    await naturalClick(page, locator)
    assert.equal(counter.clicks, 1, 'should call locator.click() as fallback')
  })

  it('falls back to locator.click() when boundingBox() throws', async () => {
    const { locator, counter } = makeMockLocator({ boundingBoxThrows: true })
    const page = makeMockPage({})
    await naturalClick(page, locator)
    assert.equal(counter.clicks, 1, 'should call locator.click() when boundingBox throws')
  })

  it('falls back to locator.click() when page.mouse.move is not available', async () => {
    const { locator, counter } = makeMockLocator({
      boundingBox: { x: 100, y: 100, width: 80, height: 40 },
    })
    const pageWithoutMouse = makeMockPage({ hasMouseMove: false })
    await naturalClick(pageWithoutMouse, locator)
    assert.equal(counter.clicks, 1, 'should fall back when mouse.move unavailable')
  })

  it('calls locator.evaluate() for the actual click when boundingBox is available', async () => {
    const mouseLog: MouseLog = []
    const { locator, counter } = makeMockLocator({
      boundingBox: { x: 200, y: 300, width: 100, height: 50 },
    })
    const page = makeMockPage({ mouseLog })
    await naturalClick(page, locator)
    assert.equal(counter.evaluates, 1, 'should call locator.evaluate() for the natural click')
  })

  it('moves mouse along a path (multiple move events) before clicking', async () => {
    const mouseLog: MouseLog = []
    const { locator } = makeMockLocator({
      boundingBox: { x: 400, y: 400, width: 120, height: 60 },
    })
    const page = makeMockPage({ mouseLog })
    await naturalClick(page, locator)
    const moves = mouseLog.filter((e) => e.action === 'move')
    assert.ok(moves.length >= 2, `Expected multiple mouse moves, got ${moves.length}`)
  })

  it('target x/y land within element bounding box bounds', async () => {
    const mouseLog: MouseLog = []
    const box = { x: 100, y: 200, width: 80, height: 40 }
    const { locator } = makeMockLocator({ boundingBox: box })
    const page = makeMockPage({ mouseLog })
    await naturalClick(page, locator)
    // Final move before click should be within element bounds (with jitter ±2px tolerance)
    const lastMove = mouseLog.filter((e) => e.action === 'move').pop()
    assert.ok(lastMove, 'should have at least one mouse move')
    assert.ok(
      (lastMove.x ?? 0) >= box.x - 3 && (lastMove.x ?? 0) <= box.x + box.width + 3,
      `x=${lastMove.x} should be within box [${box.x}, ${box.x + box.width}]`,
    )
    assert.ok(
      (lastMove.y ?? 0) >= box.y - 3 && (lastMove.y ?? 0) <= box.y + box.height + 3,
      `y=${lastMove.y} should be within box [${box.y}, ${box.y + box.height}]`,
    )
  })

  it('falls back to locator.click(force) when evaluate throws (element detached)', async () => {
    const mouseLog: MouseLog = []
    let forcedClicks = 0
    const locator = {
      boundingBox: async () => ({ x: 100, y: 100, width: 80, height: 40 }),
      click: async (opts?: { force?: boolean }) => {
        if (opts?.force) forcedClicks++
      },
      evaluate: async () => { throw new Error('Element is detached from DOM') },
    } as unknown as Locator
    const page = makeMockPage({ mouseLog })
    // Should not throw
    await naturalClick(page, locator)
    assert.equal(forcedClicks, 1, 'should call locator.click({force:true}) as last resort fallback')
  })
})

// ---------------------------------------------------------------------------
// humanPause
// ---------------------------------------------------------------------------

describe('humanPause', () => {
  it('calls page.waitForTimeout with a duration within [min, max]', async () => {
    const captured: number[] = []
    const page = {
      waitForTimeout: async (ms: number) => { captured.push(ms) },
    } as unknown as Page

    await humanPause(page, 200, 600)

    assert.equal(captured.length, 1, 'should call waitForTimeout exactly once')
    assert.ok(captured[0] >= 200 && captured[0] <= 600, `timeout ${captured[0]} should be in [200, 600]`)
  })

  it('uses default range [400, 1400] when no args provided', async () => {
    const captured: number[] = []
    const page = {
      waitForTimeout: async (ms: number) => { captured.push(ms) },
    } as unknown as Page
    await humanPause(page)
    assert.ok(captured[0] >= 400 && captured[0] <= 1400, `default timeout ${captured[0]} should be in [400, 1400]`)
  })

  it('duration is always an integer (no fractional ms)', async () => {
    const captured: number[] = []
    const page = {
      waitForTimeout: async (ms: number) => { captured.push(ms) },
    } as unknown as Page
    await humanPause(page, 100, 500)
    assert.equal(captured[0], Math.floor(captured[0]), 'timeout must be integer ms')
  })
})

// ---------------------------------------------------------------------------
// humanScroll
// ---------------------------------------------------------------------------

describe('humanScroll', () => {
  it('scrolls down (positive deltaY)', async () => {
    const mouseLog: MouseLog = []
    const page = {
      mouse: {
        wheel: async (dx: number, dy: number) => { mouseLog.push({ action: 'wheel', deltaX: dx, deltaY: dy }) },
      },
      waitForTimeout: async () => {},
    } as unknown as Page

    await humanScroll(page, 'down')

    const wheel = mouseLog.find((e) => e.action === 'wheel')
    assert.ok(wheel, 'should call mouse.wheel')
    assert.ok((wheel?.deltaY ?? 0) > 0, `scroll down should have positive deltaY, got ${wheel?.deltaY}`)
  })

  it('scrolls up (negative deltaY)', async () => {
    const mouseLog: MouseLog = []
    const page = {
      mouse: {
        wheel: async (dx: number, dy: number) => { mouseLog.push({ action: 'wheel', deltaX: dx, deltaY: dy }) },
      },
      waitForTimeout: async () => {},
    } as unknown as Page

    await humanScroll(page, 'up')

    const wheel = mouseLog.find((e) => e.action === 'wheel')
    assert.ok(wheel, 'should call mouse.wheel')
    assert.ok((wheel?.deltaY ?? 0) < 0, `scroll up should have negative deltaY, got ${wheel?.deltaY}`)
  })

  it('defaults to scroll down when direction is omitted', async () => {
    const mouseLog: MouseLog = []
    const page = {
      mouse: {
        wheel: async (dx: number, dy: number) => { mouseLog.push({ action: 'wheel', deltaX: dx, deltaY: dy }) },
      },
      waitForTimeout: async () => {},
    } as unknown as Page

    await humanScroll(page)

    const wheel = mouseLog.find((e) => e.action === 'wheel')
    assert.ok((wheel?.deltaY ?? 0) > 0, 'default direction should be down (positive deltaY)')
  })

  it('scroll amount is within expected range [100, 400]', async () => {
    const mouseLog: MouseLog = []
    const page = {
      mouse: {
        wheel: async (dx: number, dy: number) => { mouseLog.push({ action: 'wheel', deltaX: dx, deltaY: dy }) },
      },
      waitForTimeout: async () => {},
    } as unknown as Page

    await humanScroll(page, 'down')

    const wheel = mouseLog.find((e) => e.action === 'wheel')
    const dy = wheel?.deltaY ?? 0
    assert.ok(dy >= 100 && dy <= 400, `deltaY=${dy} should be in [100, 400]`)
  })

  it('calls waitForTimeout after scroll (human pacing)', async () => {
    const timeouts: number[] = []
    const page = {
      mouse: { wheel: async () => {} },
      waitForTimeout: async (ms: number) => { timeouts.push(ms) },
    } as unknown as Page

    await humanScroll(page, 'down')
    assert.ok(timeouts.length > 0, 'should wait after scroll to mimic human pacing')
    assert.ok(timeouts[0] >= 200 && timeouts[0] <= 500, `post-scroll wait ${timeouts[0]} should be in [200, 500]`)
  })
})
