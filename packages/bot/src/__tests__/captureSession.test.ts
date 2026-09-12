import { describe, it, before, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'

import {
  waitForNikeAuthCookie,
  persistSessionSnapshot,
  loadSessionSnapshot,
  injectSessionSnapshot,
  completeOAuthHandshake,
  captureFullSession,
} from '../auth/captureSession.ts'
import type { SessionSnapshot } from '../auth/captureSession.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SNAPSHOT: SessionSnapshot = {
  cookies: [
    {
      name: 'sid',
      value: 'test-sid-value',
      domain: '.accounts.nike.com',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    } as any,
  ],
  localStorage: {
    'https://www.nike.com': { 'oidc.user': '{"access_token":"tok123"}' },
  },
  sessionStorage: {},
  capturedAt: '2026-04-13T12:00:00.000Z',
}

function makeMockContext(opts: {
  cookieDomain?: string
  hasSid?: boolean
  pollCount?: number
  addCookiesSpy?: (cookies: unknown[]) => void
  addInitScriptSpy?: (script: string) => void
}): BrowserContext {
  const {
    cookieDomain = '.accounts.nike.com',
    hasSid = false,
    pollCount = 0,
    addCookiesSpy = () => {},
    addInitScriptSpy = () => {},
  } = opts

  let calls = 0

  return {
    cookies: async () => {
      calls++
      if (hasSid && calls > pollCount) {
        return [{ name: 'sid', domain: cookieDomain, value: 'abc' }]
      }
      return []
    },
    addCookies: async (c: unknown[]) => addCookiesSpy(c),
    addInitScript: async (s: string) => addInitScriptSpy(s),
  } as unknown as BrowserContext
}

function makeMockPage(opts: {
  url?: string
  oidcInStorage?: boolean
  gotoThrows?: boolean
  evaluateThrows?: boolean
}): Page {
  const { url = 'https://www.nike.com/fr', oidcInStorage = false, gotoThrows = false, evaluateThrows = false } = opts

  let _url = url
  return {
    url: () => _url,
    goto: async (target: string) => {
      if (gotoThrows) throw new Error('Navigation failed')
      _url = target
      return null
    },
    waitForURL: async (_pattern: unknown) => {},
    waitForTimeout: async (_ms: number) => {},
    waitForLoadState: async (_state: string) => {},
    evaluate: async (fn: Function) => {
      if (evaluateThrows) throw new Error('evaluate failed')
      // Simulate captureFullSession storage read
      if (fn.toString().includes('window.localStorage.length')) {
        return { origin: _url, ls: { testKey: 'testVal' }, ss: {} }
      }
      // Simulate completeOAuthHandshake localStorage check
      if (fn.toString().includes('oidc.')) {
        return oidcInStorage
      }
      // Simulate completeOAuthHandshake Continue button click
      if (fn.toString().includes('querySelectorAll')) {
        return false // no Continue button by default
      }
      return null
    },
  } as unknown as Page
}

// ---------------------------------------------------------------------------
// sanitizeAccountId — tested via loadSessionSnapshot with invalid input
//
// Security note: basename('../etc/passwd') = 'passwd' — the function strips
// the path prefix and normalises to the filename only. It does NOT throw on
// path traversal; it sanitises by reduction. Throws only for empty or
// dot-only account IDs (which would create paths like ".." or ".").
// ---------------------------------------------------------------------------

describe('sanitizeAccountId (via loadSessionSnapshot)', () => {
  it('path traversal is sanitised by basename: ../etc/passwd → reads passwd.snapshot.json safely', async () => {
    // basename strips the path — the function does NOT throw, it normalises.
    // The file simply won't exist, so we get a "snapshot missing" error (not a security error).
    await assert.rejects(
      () => loadSessionSnapshot('../etc/passwd'),
      (err: Error) => {
        assert.ok(
          err.message.includes('snapshot missing') || err.message.includes('capture-session'),
          `Expected snapshot-missing error (sanitised), got: ${err.message}`,
        )
        return true
      },
    )
  })

  it('throws on dot-only account ID: ..', async () => {
    await assert.rejects(
      () => loadSessionSnapshot('..'),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid account ID'), `Expected "Invalid account ID", got: ${err.message}`)
        return true
      },
    )
  })

  it('throws on empty account ID', async () => {
    await assert.rejects(
      () => loadSessionSnapshot(''),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid account ID'), `Expected "Invalid account ID", got: ${err.message}`)
        return true
      },
    )
  })
})

// ---------------------------------------------------------------------------
// waitForNikeAuthCookie
// ---------------------------------------------------------------------------

describe('waitForNikeAuthCookie', () => {
  it('returns true when sid cookie appears on first poll', async () => {
    const ctx = makeMockContext({ hasSid: true, pollCount: 0, cookieDomain: '.accounts.nike.com' })
    const result = await waitForNikeAuthCookie(ctx, 5000, 50)
    assert.equal(result, true)
  })

  it('returns true when sid appears on accounts.nike.com (no dot prefix)', async () => {
    const ctx = makeMockContext({ hasSid: true, pollCount: 0, cookieDomain: 'accounts.nike.com' })
    const result = await waitForNikeAuthCookie(ctx, 5000, 50)
    assert.equal(result, true)
  })

  it('returns true after a few polls (cookie arrives late)', async () => {
    const ctx = makeMockContext({ hasSid: true, pollCount: 2, cookieDomain: '.accounts.nike.com' })
    const result = await waitForNikeAuthCookie(ctx, 5000, 50)
    assert.equal(result, true)
  })

  it('returns false when timeout expires without sid', async () => {
    const ctx = makeMockContext({ hasSid: false })
    const result = await waitForNikeAuthCookie(ctx, 100, 30)
    assert.equal(result, false)
  })

  it('ignores non-sid cookies', async () => {
    const ctx = {
      cookies: async () => [{ name: 'access_token', domain: '.accounts.nike.com', value: 'x' }],
    } as unknown as BrowserContext
    const result = await waitForNikeAuthCookie(ctx, 100, 30)
    assert.equal(result, false)
  })
})

// ---------------------------------------------------------------------------
// persistSessionSnapshot + loadSessionSnapshot
// ---------------------------------------------------------------------------

describe('persistSessionSnapshot + loadSessionSnapshot', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'tea-capture-test-'))
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('round-trip: persisted snapshot matches loaded snapshot', async () => {
    await persistSessionSnapshot('acc-001', VALID_SNAPSHOT, tmpDir)
    const loaded = await loadSessionSnapshot('acc-001', tmpDir)
    assert.deepEqual(loaded.cookies, VALID_SNAPSHOT.cookies)
    assert.deepEqual(loaded.localStorage, VALID_SNAPSHOT.localStorage)
    assert.equal(loaded.capturedAt, VALID_SNAPSHOT.capturedAt)
  })

  it('writes cookies.json file for backwards compatibility', async () => {
    await persistSessionSnapshot('acc-compat', VALID_SNAPSHOT, tmpDir)
    const raw = await readFile(join(tmpDir, 'acc-compat.json'), 'utf8')
    const cookies = JSON.parse(raw)
    assert.ok(Array.isArray(cookies), 'cookies.json should contain an array')
    assert.equal(cookies[0].name, 'sid')
  })

  it('throws when snapshot file does not exist', async () => {
    await assert.rejects(
      () => loadSessionSnapshot('nonexistent-account', tmpDir),
      (err: Error) => {
        assert.ok(
          err.message.includes('snapshot missing') || err.message.includes('capture-session'),
          `Expected helpful error, got: ${err.message}`,
        )
        return true
      },
    )
  })

  it('throws when snapshot file is corrupt (missing cookies field)', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(tmpDir, 'corrupt-acc.snapshot.json'), JSON.stringify({ capturedAt: '2026-01-01' }))
    await assert.rejects(
      () => loadSessionSnapshot('corrupt-acc', tmpDir),
      (err: Error) => {
        assert.ok(err.message.includes('corrupt'), `Expected "corrupt", got: ${err.message}`)
        return true
      },
    )
  })

  it('throws when snapshot JSON is not parseable', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(tmpDir, 'bad-json.snapshot.json'), '{ invalid json !!!', 'utf8')
    await assert.rejects(() => loadSessionSnapshot('bad-json', tmpDir))
  })
})

// ---------------------------------------------------------------------------
// injectSessionSnapshot
// ---------------------------------------------------------------------------

describe('injectSessionSnapshot', () => {
  it('calls addCookies with snapshot cookies', async () => {
    const cookiesSent: unknown[][] = []
    const ctx = makeMockContext({ addCookiesSpy: (c) => cookiesSent.push(c) })
    await injectSessionSnapshot(ctx, VALID_SNAPSHOT)
    assert.equal(cookiesSent.length, 1)
    assert.equal((cookiesSent[0] as any[])[0].name, 'sid')
  })

  it('calls addInitScript with a script that references localStorage origins', async () => {
    const scripts: string[] = []
    const ctx = makeMockContext({ addInitScriptSpy: (s) => scripts.push(s) })
    await injectSessionSnapshot(ctx, VALID_SNAPSHOT)
    assert.equal(scripts.length, 1)
    assert.ok(scripts[0].includes('https://www.nike.com'), 'script should reference Nike origin')
    assert.ok(scripts[0].includes('localStorage'), 'script should set localStorage')
  })

  it('skips addCookies when cookies array is empty', async () => {
    const cookiesSent: unknown[][] = []
    const ctx = makeMockContext({ addCookiesSpy: (c) => cookiesSent.push(c) })
    const emptySnapshot: SessionSnapshot = { ...VALID_SNAPSHOT, cookies: [] }
    await injectSessionSnapshot(ctx, emptySnapshot)
    assert.equal(cookiesSent.length, 0)
  })
})

// ---------------------------------------------------------------------------
// completeOAuthHandshake
// ---------------------------------------------------------------------------

describe('completeOAuthHandshake', () => {
  it('returns true when oidc.* key present in localStorage after navigation', async () => {
    const page = makeMockPage({ url: 'https://www.nike.com/fr', oidcInStorage: true })
    const result = await completeOAuthHandshake(page, 3000)
    assert.equal(result, true)
  })

  it('returns false when navigation throws', async () => {
    const page = makeMockPage({ gotoThrows: true })
    const result = await completeOAuthHandshake(page, 1000)
    assert.equal(result, false)
  })

  it('returns false when oidc key never appears within timeout', async () => {
    const page = makeMockPage({ url: 'https://www.nike.com/fr', oidcInStorage: false })
    // Very short timeout to avoid slowing test suite
    const result = await completeOAuthHandshake(page, 200)
    assert.equal(result, false)
  })
})

// ---------------------------------------------------------------------------
// captureFullSession
// ---------------------------------------------------------------------------

describe('captureFullSession', () => {
  it('returns snapshot with cookies, localStorage, sessionStorage, and capturedAt', async () => {
    const ctx = {
      cookies: async () => [
        { name: 'sid', domain: '.accounts.nike.com', value: 'abc', path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: -1 },
        { name: 'unrelated', domain: '.google.com', value: 'x' },
      ],
    } as unknown as BrowserContext

    const page = makeMockPage({ url: 'https://www.nike.com/fr' })
    const snapshot = await captureFullSession(ctx, page)

    // Only Nike-domain cookies should be included
    assert.ok(snapshot.cookies.every((c) => c.domain.includes('nike.com')), 'non-Nike cookies must be filtered')
    assert.equal(snapshot.cookies[0].name, 'sid')

    assert.ok(typeof snapshot.localStorage === 'object', 'localStorage should be an object')
    assert.ok(typeof snapshot.sessionStorage === 'object', 'sessionStorage should be an object')
    assert.ok(typeof snapshot.capturedAt === 'string', 'capturedAt should be a string')
    assert.ok(new Date(snapshot.capturedAt).getTime() > 0, 'capturedAt should be a valid date')
  })

  it('filters out non-Nike-domain cookies', async () => {
    const ctx = {
      cookies: async () => [
        { name: 'tracker', domain: '.doubleclick.net', value: 'x' },
        { name: 'analytics', domain: '.google-analytics.com', value: 'y' },
      ],
    } as unknown as BrowserContext
    const page = makeMockPage({})
    const snapshot = await captureFullSession(ctx, page)
    assert.equal(snapshot.cookies.length, 0, 'non-Nike cookies should be excluded')
  })

  it('continues gracefully when page.goto fails for a domain', async () => {
    const ctx = {
      cookies: async () => [],
    } as unknown as BrowserContext

    const page = makeMockPage({ gotoThrows: true })
    // Should NOT throw — domains that fail are skipped with a console.warn
    const snapshot = await captureFullSession(ctx, page)
    assert.ok(typeof snapshot.capturedAt === 'string')
  })
})
