/**
 * Launches the real, system-installed Google Chrome through `patchright` —
 * a Playwright fork that fixes the protocol-level leaks Kasada relies on:
 *   - `Runtime.enable` is rewritten so init scripts run in an isolated world
 *     with no observable bridge to the main page.
 *   - the utility world keeps a normal name (no "__playwright_utility_world__"
 *     fingerprint).
 *   - `--enable-automation` is dropped from the default args, and closed Shadow
 *     DOM is exposed automatically so anti-bot scripts that probe shadow trees
 *     don't trip on missing references.
 *
 * Why not vanilla Playwright + stealth plugin? Stealth only patches JS — it
 * cannot mask Runtime.enable. Kasada checks Runtime.enable BEFORE any of our
 * init scripts have a chance to run; that's why the login flow used to fail
 * with "Erreur lors de l'analyse de la réponse du serveur" right after the
 * email step.
 *
 * We layer additional addInitScript-based JS evasions on top to fill the gaps
 * patchright doesn't handle by itself (custom plugin/mimeType arrays, fake
 * chrome.runtime/loadTimes/csi, WebGL Apple-M2 spoof, etc.).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'patchright'
import type { BrowserContext } from 'playwright'

const CHROME_PATHS: string[] = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',  // macOS
  '/usr/bin/google-chrome',  // Linux
  '/usr/bin/google-chrome-stable',  // Linux
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',  // Windows
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',  // Windows
]

/**
 * Locate the Chrome/Chromium binary to spawn. Resolution order:
 *   1. NIKE_BOT_CHROME_PATH override (explicit operator choice).
 *   2. System Google Chrome — PREFERRED: real Chrome sends the "Google Chrome"
 *      sec-ch-ua brand Kasada expects, giving the best bypass odds.
 *   3. The Chromium bundled in the .app/.exe (resolved from PLAYWRIGHT_BROWSERS_PATH)
 *      so the packaged build still runs on a machine WITHOUT Google Chrome.
 */
function findChromeBinary(): string {
  const override = process.env.NIKE_BOT_CHROME_PATH
  if (override && existsSync(override)) return override
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  // Fallback: the bundled Playwright/patchright Chromium shipped inside the
  // packaged app (PLAYWRIGHT_BROWSERS_PATH is set by the launcher to .../browsers).
  const bundled = findBundledChromium()
  if (bundled) {
    console.warn('  [chrome] System Google Chrome not found — using the bundled Chromium (slightly higher bot-detection risk than real Chrome)')
    return bundled
  }
  throw new Error('Google Chrome not found. Install it from https://www.google.com/chrome/ (or ship a bundled Chromium under PLAYWRIGHT_BROWSERS_PATH).')
}

/**
 * Resolve the chromium executable inside PLAYWRIGHT_BROWSERS_PATH (the directory
 * the packaged app sets up at build time). Scans the platform-specific
 * chromium build directory. Returns undefined if none is present.
 */
function findBundledChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (!base || !existsSync(base)) return undefined
  try {
    const candidates: string[] = []
    for (const entry of readdirSync(base)) {
      // Match the chromium build dir but NOT the headless-shell variant.
      if (!/^chromium-/.test(entry) || /headless/.test(entry)) continue
      const dir = join(base, entry)
      // The platform subdir is named chrome-mac-arm64 / chrome-mac-x64 /
      // chrome-linux / chrome-win64 / chrome-win — enumerate whatever is there.
      let platformDirs: string[] = []
      try {
        platformDirs = readdirSync(dir).filter((d) => /^chrome-(mac|linux|win)/.test(d))
      } catch { /* dir not readable */ }
      for (const pd of platformDirs) {
        const p = join(dir, pd)
        // macOS app bundles
        candidates.push(join(p, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'))
        candidates.push(join(p, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
        // Linux / Windows flat binaries
        candidates.push(join(p, 'chrome'))
        candidates.push(join(p, 'chrome.exe'))
      }
    }
    return candidates.find((p) => existsSync(p))
  } catch {
    return undefined
  }
}

export interface RealChromeHandle {
  context: BrowserContext
  close: () => Promise<void>
}

export interface RealChromeOptions {
  headless?: boolean  // Default: false (visible browser — Kasada fingerprints --headless=new)
  port?: number  // Reserved for backwards compatibility, ignored by launchPersistentContext.
  userDataDir?: string  // Default: ~/.nike-bot/chrome-profile
  locale?: string  // Default: 'fr-FR'
  timezone?: string  // Default: 'Europe/Paris'
  accountId?: string  // When set, uses a per-account profile under ~/.nike-bot/profiles/{accountId}
  proxy?: string  // Full proxy URL: http://user:pass@host:port (or socks5://host:port). Per-account exit IP.
}

/**
 * Per-account persistent profile directory.
 * Each account gets an isolated Chrome profile so sessions don't mix across accounts,
 * AND so Kasada sees a returning user (cookies, history) instead of a fresh install
 * on every login.
 */
export function accountProfileDir(accountId: string): string {
  const safe = accountId.replace(/[^a-zA-Z0-9@._-]/g, '_')
  return join(homedir(), '.nike-bot', 'profiles', safe)
}

/**
 * Init script kept DELIBERATELY MINIMAL.
 *
 * Earlier versions injected a full stealth-plugin-equivalent (override
 * navigator.plugins, languages, hardwareConcurrency, deviceMemory, WebGL
 * vendor/renderer, chrome.runtime/loadTimes/csi, Battery, etc.). All of these
 * use Object.defineProperty to install JS getters whose .toString() output
 * differs from a real native getter — and Kasada's ips.js sensor checks
 * exactly that. With the heavy stealth script enabled, the login flow gets
 * "Erreur lors de l'analyse de la réponse du serveur"; with it off, the OAuth
 * flow proceeds normally to accounts.nike.com/challenge-code. Verified live
 * 2026-05-03.
 *
 * Patchright already handles all the protocol-level leaks Kasada actually
 * cares about (Runtime.enable, utility world, --enable-automation, closed
 * Shadow DOM). We only keep the cookie-consent modal cleanup here because
 * it touches DOM elements without modifying any navigator/window getter.
 *
 * Set NIKE_BOT_FULL_STEALTH=1 to re-enable the full stealth pack (kept as a
 * fallback for sites that DON'T run Kasada and DO check navigator.plugins).
 *
 * Kept as a string template (NOT an arrow/function literal) — tsx/esbuild
 * compiles function expressions with `__name()` helper calls that are
 * undefined inside Chrome and silently break the script.
 */
const COOKIE_NUKE_INIT_SCRIPT = String.raw`
(function () {
  'use strict';
  try {
    function nukeCookieModal() {
      // SCOPED to the COOKIE modal only. The previous version removed EVERY
      // [data-testid="modal-backdrop"] on every DOM mutation — but Nike reuses
      // that same backdrop testid for the PAYMENT / 3DS / order-review modals.
      // Blanket-removing it tore those down at checkout: focus-trap crashed
      // ("must have at least one tabbable node"), the Adyen 3DS action never
      // mounted, and the order hung on an infinite spinner. So: do NOTHING
      // unless the cookie modal is actually on the page, then remove only its
      // own nodes. Verified live 2026-05-29.
      var cookieModal = document.querySelector('[data-testid="cookie-modal"]');
      var cookieRoot = document.querySelector('[data-testid="cookie-modal-root"]');
      if (!cookieModal && !cookieRoot) return;
      if (cookieRoot && cookieRoot.parentElement) cookieRoot.parentElement.removeChild(cookieRoot);
      var wrapper = cookieModal && cookieModal.closest ? cookieModal.closest('.modal-portal-content-wrapper') : null;
      if (wrapper && wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
      // Remove the backdrop only now that we've confirmed a cookie modal exists.
      var backdrop = document.querySelector('[data-testid="modal-backdrop"]');
      if (backdrop && backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    }
    nukeCookieModal();
    var obs = new MutationObserver(function () { nukeCookieModal(); });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        obs.observe(document.body, { childList: true, subtree: true });
        nukeCookieModal();
      });
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[nike-bot cookie nuke] ' + e);
  }
})();
`

/**
 * Heavy stealth pack — disabled by default since 2026-05-03 because Kasada
 * fingerprints its non-native getters. Enable on non-Kasada targets only.
 */
const FULL_STEALTH_INIT_SCRIPT = String.raw`
(function () {
  'use strict';
  try {
    // ----- navigator.plugins / mimeTypes (native PluginArray, not Array) -----
    function makePluginArray(plugins) {
      var arr = Object.create(PluginArray.prototype);
      plugins.forEach(function (p, i) { arr[i] = p; arr[p.name] = p; });
      Object.defineProperty(arr, 'length', { value: plugins.length });
      arr.item = function (i) { return arr[i] || null; };
      arr.namedItem = function (n) { return arr[n] || null; };
      arr.refresh = function () {};
      return arr;
    }
    function makeMimeType(spec, plugin) {
      var m = Object.create(MimeType.prototype);
      Object.defineProperty(m, 'type', { value: spec.type });
      Object.defineProperty(m, 'suffixes', { value: spec.suffixes });
      Object.defineProperty(m, 'description', { value: spec.description });
      Object.defineProperty(m, 'enabledPlugin', { value: plugin });
      return m;
    }
    function makePlugin(spec) {
      var p = Object.create(Plugin.prototype);
      Object.defineProperty(p, 'name', { value: spec.name });
      Object.defineProperty(p, 'filename', { value: spec.filename });
      Object.defineProperty(p, 'description', { value: spec.description });
      Object.defineProperty(p, 'length', { value: spec.mimes.length });
      spec.mimes.forEach(function (mt, i) {
        var m = makeMimeType(mt, p);
        p[i] = m;
        p[mt.type] = m;
      });
      p.item = function (i) { return p[i] || null; };
      p.namedItem = function (n) { return p[n] || null; };
      return p;
    }
    var pdfMimes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ];
    var pluginSpecs = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: pdfMimes },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: pdfMimes },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: pdfMimes },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: pdfMimes },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimes: pdfMimes }
    ];
    var pluginInstances = pluginSpecs.map(makePlugin);
    var pluginArr = makePluginArray(pluginInstances);
    Object.defineProperty(Navigator.prototype, 'plugins', { get: function () { return pluginArr; }, configurable: true });
    var mimeArr = Object.create(MimeTypeArray.prototype);
    var idx = 0;
    pluginInstances.forEach(function (p) {
      for (var i = 0; i < p.length; i++) {
        var m = p[i];
        mimeArr[idx++] = m;
        mimeArr[m.type] = m;
      }
    });
    Object.defineProperty(mimeArr, 'length', { value: idx });
    mimeArr.item = function (i) { return mimeArr[i] || null; };
    mimeArr.namedItem = function (n) { return mimeArr[n] || null; };
    Object.defineProperty(Navigator.prototype, 'mimeTypes', { get: function () { return mimeArr; }, configurable: true });

    // ----- navigator.languages -----
    Object.defineProperty(Navigator.prototype, 'languages', { get: function () { return ['fr-FR', 'fr', 'en-US', 'en']; }, configurable: true });

    // ----- navigator.hardwareConcurrency / deviceMemory -----
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: function () { return 8; }, configurable: true });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: function () { return 8; }, configurable: true });

    // ----- navigator.permissions.query — fix the "denied" leak for notifications -----
    if (navigator.permissions && navigator.permissions.query) {
      var origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (params) {
        if (params && params.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, name: 'notifications', onchange: null });
        }
        return origQuery(params);
      };
    }

    // ----- WebGL vendor / renderer (consistent macOS Apple M2 fingerprint) -----
    var glPatch = function (proto) {
      var orig = proto.getParameter;
      proto.getParameter = function (param) {
        if (param === 37445) return 'Google Inc. (Apple)';
        if (param === 37446) return 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)';
        return orig.call(this, param);
      };
    };
    if (typeof WebGLRenderingContext !== 'undefined') glPatch(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== 'undefined') glPatch(WebGL2RenderingContext.prototype);

    // ----- chrome.* objects (runtime, loadTimes, csi) — only fill what's missing -----
    if (typeof window.chrome !== 'object' || window.chrome === null) {
      try { Object.defineProperty(window, 'chrome', { value: {}, configurable: true, writable: true }); } catch (e) {}
    }
    if (window.chrome && !window.chrome.runtime) {
      try {
        window.chrome.runtime = {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          connect: function () {},
          sendMessage: function () {}
        };
      } catch (e) {}
    }
    if (window.chrome && !window.chrome.loadTimes) {
      try {
        window.chrome.loadTimes = function () {
          return { commitLoadTime: Date.now() / 1000 - 1, finishDocumentLoadTime: Date.now() / 1000 - 0.5, finishLoadTime: Date.now() / 1000 - 0.2, firstPaintAfterLoadTime: 0, firstPaintTime: Date.now() / 1000 - 0.4, navigationType: 'Other', npnNegotiatedProtocol: 'h2', requestTime: Date.now() / 1000 - 2, startLoadTime: Date.now() / 1000 - 2, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: true, wasNpnNegotiated: true };
        };
      } catch (e) {}
    }
    if (window.chrome && !window.chrome.csi) {
      try {
        window.chrome.csi = function () {
          return { onloadT: Date.now(), pageT: Math.random() * 1000, startE: Date.now() - 1000, tran: 15 };
        };
      } catch (e) {}
    }

    // ----- outerHeight / outerWidth = 0 leak (headless signal) -----
    if (window.outerHeight === 0 || window.outerWidth === 0) {
      try {
        Object.defineProperty(window, 'outerHeight', { get: function () { return window.innerHeight; }, configurable: true });
        Object.defineProperty(window, 'outerWidth', { get: function () { return window.innerWidth; }, configurable: true });
      } catch (e) {}
    }

    // ----- Battery API stub -----
    if (typeof navigator.getBattery === 'function') {
      var origBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = function () {
        return origBattery().catch(function () {
          return { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 0.95, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; } };
        });
      };
    }

    // ----- Nike cookie consent modal nuke -----
    function nukeCookieModal() {
      // SCOPED to the COOKIE modal only. The previous version removed EVERY
      // [data-testid="modal-backdrop"] on every DOM mutation — but Nike reuses
      // that same backdrop testid for the PAYMENT / 3DS / order-review modals.
      // Blanket-removing it tore those down at checkout: focus-trap crashed
      // ("must have at least one tabbable node"), the Adyen 3DS action never
      // mounted, and the order hung on an infinite spinner. So: do NOTHING
      // unless the cookie modal is actually on the page, then remove only its
      // own nodes. Verified live 2026-05-29.
      var cookieModal = document.querySelector('[data-testid="cookie-modal"]');
      var cookieRoot = document.querySelector('[data-testid="cookie-modal-root"]');
      if (!cookieModal && !cookieRoot) return;
      if (cookieRoot && cookieRoot.parentElement) cookieRoot.parentElement.removeChild(cookieRoot);
      var wrapper = cookieModal && cookieModal.closest ? cookieModal.closest('.modal-portal-content-wrapper') : null;
      if (wrapper && wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
      // Remove the backdrop only now that we've confirmed a cookie modal exists.
      var backdrop = document.querySelector('[data-testid="modal-backdrop"]');
      if (backdrop && backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    }
    nukeCookieModal();
    var obs = new MutationObserver(function () { nukeCookieModal(); });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        obs.observe(document.body, { childList: true, subtree: true });
        nukeCookieModal();
      });
    }
  } catch (err) {
    // Never throw from an init script.
    if (typeof console !== 'undefined' && console.warn) console.warn('[nike-bot stealth init] ' + err);
  }
})();
`

/**
 * Launch real Chrome (system install) through rebrowser-playwright's patched
 * `launchPersistentContext`. The returned BrowserContext owns its own profile.
 *
 * Cookies, localStorage, and login state PERSIST between runs in the userDataDir.
 * This means: log in once manually, and all subsequent runs use that session.
 */
export async function launchRealChrome(
  options: RealChromeOptions = {},
): Promise<RealChromeHandle> {
  const {
    headless = false,
    accountId,
    userDataDir = accountId
      ? accountProfileDir(accountId)
      : join(homedir(), '.nike-bot', 'chrome-profile'),
    locale = 'fr-FR',
  } = options
  // timezoneId can only be set on a context launched via Playwright (not via
  // CDP attach). Chrome inherits the system timezone in CDP attach mode.
  void options.timezone
  const port = options.port ?? 9222 + Math.floor(Math.random() * 100)

  // Per-account proxy: parse the URL into a Chrome --proxy-server value (scheme
  // + host:port, NO inline creds — Chrome rejects user:pass@ in --proxy-server).
  // Auth (if any) is applied AFTER connectOverCDP via ctx.setHTTPCredentials,
  // which patchright drives through Fetch.authRequired → continueWithAuth and
  // works even on an externally-spawned, CDP-attached Chrome.
  let proxyServer: string | undefined
  let proxyUsername: string | undefined
  let proxyPassword: string | undefined
  if (options.proxy && options.proxy.trim() !== '') {
    try {
      const { parseProxyUrl } = await import('./proxyValidator.ts')
      const parsed = parseProxyUrl(options.proxy)
      proxyServer = parsed.server
      proxyUsername = parsed.username
      proxyPassword = parsed.password
    } catch (err) {
      console.error(`  [proxy] invalid proxy URL, launching WITHOUT proxy: ${(err as Error).message}`)
    }
  }

  mkdirSync(userDataDir, { recursive: true })

  // Clear stale Chrome singleton locks from a previous crashed run.
  // If a previous launchRealChrome was killed before close() ran, Chrome leaves
  // SingletonLock/SingletonCookie/SingletonSocket symlinks behind and the next
  // launch aborts with "Failed to create a ProcessSingleton for your profile
  // directory". Removing them is safe: the lock is per-profile and we serialize
  // launches per accountId.
  for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = join(userDataDir, lockName)
    try { unlinkSync(lockPath) } catch { /* lock absent — fine */ }
  }

  // Hardened Chrome args. Each one was added because either:
  //   (a) the default value leaks an automation signal Kasada fingerprints, or
  //   (b) it improves session realism (no first-run wizard, no infobars).
  // Notably we do NOT pass --no-sandbox or --disable-dev-shm-usage on desktop —
  // those are CI-only tweaks and Kasada uses their presence as a bot heuristic.
  // We also do NOT pass --disable-blink-features=AutomationControlled here:
  // patchright handles that automatically and double-passing can produce a
  // duplicate-arg signature that some fingerprinters look for.
  const args: string[] = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--lang=${locale}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationHints,LensOverlay,PrivacySandboxAdsAPIs',
    '--disable-infobars',
    '--disable-component-update',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-ipc-flooding-protection',
    '--password-store=basic',
    '--use-mock-keychain',
  ]
  if (proxyServer) {
    // host:port (scheme included) — credentials applied post-attach.
    args.push(`--proxy-server=${proxyServer}`)
    console.log(`  [proxy] routing through ${proxyServer}${proxyUsername ? ' (authenticated)' : ''}`)
  }
  if (!headless) {
    args.push('--start-maximized', '--window-position=100,50')
  } else {
    args.push('--headless=new')
    args.push('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36')
  }

  // Load extensions from ~/.nike-bot/extensions if they exist (e.g. captcha solvers)
  const extensionsDir = join(homedir(), '.nike-bot', 'extensions')
  if (existsSync(extensionsDir)) {
    const { readdirSync } = await import('node:fs')
    const exts = readdirSync(extensionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(extensionsDir, d.name))
    if (exts.length > 0) {
      args.push(`--load-extension=${exts.join(',')}`)
      args.push(`--disable-extensions-except=${exts.join(',')}`)
      console.log(`  [chrome] Loading ${exts.length} extension(s) from ${extensionsDir}`)
    }
  }

  // *** Spawn the system Chrome AS A NORMAL USER PROCESS, then attach via CDP. ***
  //
  // This is the path that bypasses Kasada in production — verified working since
  // commit 84393d5 ("real Chrome via CDP to bypass Kasada"). Critical points:
  //   - Chrome must NOT be launched by Playwright/patchright. They both inject
  //     CDP hooks at startup that Kasada fingerprints (Runtime.enable, etc.).
  //   - We spawn() Chrome ourselves, then call connectOverCDP() AFTER Chrome
  //     has fully booted. The browser is indistinguishable from one started by
  //     a double-click.
  //   - patchright's connectOverCDP still applies its protocol-level patches
  //     (utility-world rename, addBinding fix), so init scripts run isolated.
  const chromeBin = findChromeBinary()
  // stdio: 'pipe' — surface Chrome's startup errors (locked profile, missing
  // dylibs, etc.) instead of silently timing out at the CDP probe loop.
  const chromeProcess: ChildProcess = spawn(chromeBin, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let chromeStderr = ''
  chromeProcess.stdout?.on('data', (b) => { chromeStderr += b.toString('utf8') })
  chromeProcess.stderr?.on('data', (b) => { chromeStderr += b.toString('utf8') })
  chromeProcess.on('exit', (code, sig) => {
    if (code !== 0 && code !== null) {
      console.error(`[chrome] exited early code=${code} sig=${sig}\n${chromeStderr.slice(-2000)}`)
    }
  })

  // Force IPv4: on macOS Sequoia+, `localhost` can resolve to ::1 first, but
  // Chrome's --remote-debugging-port only binds on 127.0.0.1 → ECONNREFUSED.
  const cdpUrl = `http://127.0.0.1:${port}`
  const MAX_WAIT_MS = 10_000
  const start = Date.now()
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) break
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  let browser
  try {
    browser = await chromium.connectOverCDP(cdpUrl)
  } catch (err) {
    const tail = chromeStderr.slice(-1500)
    if (tail.length > 0) console.error(`[chrome] last stderr from launched process:\n${tail}`)
    try { chromeProcess.kill('SIGKILL') } catch {}
    throw err
  }

  const contexts = browser.contexts()
  const ctx = (contexts[0] ?? (await browser.newContext())) as unknown as BrowserContext

  // Authenticated proxy: supply credentials post-attach. patchright handles the
  // proxy 407 via Fetch.authRequired → continueWithAuth even though Chrome was
  // spawned externally and attached over CDP.
  if (proxyUsername) {
    try {
      await (ctx as unknown as {
        setHTTPCredentials: (c: { username: string; password: string }) => Promise<void>
      }).setHTTPCredentials({ username: proxyUsername, password: proxyPassword ?? '' })
    } catch (err) {
      console.error(`  [proxy] failed to set proxy credentials: ${(err as Error).message}`)
    }
  }

  await ctx.setExtraHTTPHeaders({
    'Accept-Language': `${locale},fr;q=0.9,en-US;q=0.8,en;q=0.7`,
  })

  // Default: only the cookie-modal nuke (DOM-only, no JS getters).
  // Set NIKE_BOT_FULL_STEALTH=1 to enable the heavy stealth pack — but DO NOT
  // do that on Kasada-protected endpoints (Nike, Akamai-fronted sites): the
  // pack uses Object.defineProperty getters whose non-native .toString() output
  // gets fingerprinted and triggers "Erreur lors de l'analyse de la réponse du
  // serveur" right after the email step. See FULL_STEALTH_INIT_SCRIPT comment.
  if (process.env.NIKE_BOT_FULL_STEALTH === '1') {
    console.log('  [stealth] FULL stealth pack enabled — expect Kasada blocks on Nike')
    await ctx.addInitScript(FULL_STEALTH_INIT_SCRIPT)
  } else {
    await ctx.addInitScript(COOKIE_NUKE_INIT_SCRIPT)
  }

  const close = async (): Promise<void> => {
    try { await browser.close() } catch { /* ignore */ }
    try {
      chromeProcess.kill('SIGTERM')
      setTimeout(() => {
        try { chromeProcess.kill('SIGKILL') } catch {}
      }, 3000)
    } catch { /* ignore */ }
  }

  return { context: ctx, close }
}
