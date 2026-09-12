/**
 * POC: Story 12.11 — Nike PATCH cart op:remove and op:replace contract discovery
 *
 * Goal: Find the exact JSON Patch body shape that Nike accepts for:
 *   1. Removing an item from the cart (op:remove)
 *   2. Changing item quantity (op:replace)
 *
 * All requests run via page.evaluate(() => fetch()) so KPSDK ServiceWorker
 * attaches valid x-kpsdk-cd/cr headers (same transport as addItem which works).
 *
 * Usage:
 *   node --import tsx packages/bot/scripts/poc-cart-mutations.ts
 */

import { randomUUID } from 'node:crypto'
import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const ACCOUNT_ID = 'candid_audio'
const PDP_URL =
  'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-ojDkV4tL/CW2288-111'
const SKU_ID = 'd0ca4bf1-a90c-5bdf-a518-997275341a24'
const SLUG = 'chaussure-air-force-1-07-pour-ojDkV4tL'
const STYLE_COLOR = 'CW2288-111'
const CART_PATCH_URL =
  'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY'
const CART_GET_URL = 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM'

// Delay between attempts to avoid rate-limiting
const DELAY_MS = 600

// ---- helpers ----------------------------------------------------------------

function log(label: string, data: unknown) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(label)
  console.log('='.repeat(70))
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

interface FetchResult {
  status: number
  headers: Record<string, string>
  body: string
  ok: boolean
}

// ---- main -------------------------------------------------------------------

async function main() {
  console.log(`[POC 12.11] Launching Chrome for account: ${ACCOUNT_ID}`)
  const handle = await createRealCheckoutContext({ accountId: ACCOUNT_ID, headless: false })

  const results: Array<{ variant: string; status: number; bodyPreview: string; success: boolean }> = []

  try {
    const page = handle.context.pages()[0] ?? (await handle.context.newPage())

    // Step 1: Navigate to PDP to bootstrap KPSDK
    console.log(`\n[1] Navigating to PDP: ${PDP_URL}`)
    await page.goto(PDP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Step 2: Wait for KPSDK
    console.log('[2] Waiting for KPSDK bootstrap (up to 8s)...')
    try {
      await page.waitForFunction(() => {
        const w = window as unknown as Record<string, unknown>
        return typeof w['KPSDK'] !== 'undefined'
      }, { timeout: 8_000 })
      console.log('  KPSDK present')
    } catch {
      console.log('  KPSDK not found — waiting 3s fallback')
      await sleep(3_000)
    }
    await sleep(2_000)

    // Step 3: Extract Bearer token
    const authState = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      const ls = w['localStorage'] as Storage
      const keys = Object.keys(ls)
      const oidcKey = keys.find((k) => k.startsWith('oidc.user:'))
      if (!oidcKey) return { token: null }
      const raw = ls.getItem(oidcKey)
      if (!raw) return { token: null }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return { token: (parsed['access_token'] as string) ?? null }
      } catch {
        return { token: null }
      }
    })

    if (!authState.token) {
      console.error('[ERROR] No OIDC token found in localStorage. Session may be expired.')
      return
    }
    console.log(`  Bearer token: ***${authState.token.slice(-8)}`)

    // Step 4: Get current cart to find item IDs
    console.log('\n[3] Fetching current cart...')
    const cartRes = await page.evaluate(
      async (a: { url: string; token: string }): Promise<FetchResult> => {
        const r = await fetch(a.url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            accept: 'application/json',
            Authorization: 'Bearer ' + a.token,
          },
        })
        const headersObj: Record<string, string> = {}
        r.headers.forEach((v, k) => { headersObj[k] = v })
        let body = ''
        try { body = await r.text() } catch { body = '' }
        return { status: r.status, headers: headersObj, body, ok: r.ok }
      },
      { url: CART_GET_URL, token: authState.token },
    )

    log('[Cart GET result]', { status: cartRes.status, body: cartRes.body.slice(0, 800) })

    interface CartItem { id: string; skuId: string; quantity: number; itemData?: { url?: string } }
    interface CartShape { id?: string; items?: CartItem[] }
    let cartItems: CartItem[] = []
    try {
      const cartData = JSON.parse(cartRes.body) as CartShape
      cartItems = cartData.items ?? []
    } catch { /* ignore */ }

    console.log(`\n  Cart contains ${cartItems.length} items:`)
    for (const item of cartItems) {
      console.log(`    - ${item.id} (skuId: ${item.skuId}, qty: ${item.quantity})`)
    }

    // Step 5: If cart is empty, add an item first
    let targetItemId: string | null = null
    let targetItem: CartItem | null = null

    if (cartItems.length === 0) {
      console.log('\n[4] Cart is empty — adding test item first...')
      await sleep(DELAY_MS)
      const addRes = await page.evaluate(
        async (a: { url: string; token: string; body: string }): Promise<FetchResult> => {
          const r = await fetch(a.url, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json; charset=UTF-8',
              Authorization: 'Bearer ' + a.token,
            },
            body: a.body,
          })
          const headersObj: Record<string, string> = {}
          r.headers.forEach((v, k) => { headersObj[k] = v })
          let body = ''
          try { body = await r.text() } catch { body = '' }
          return { status: r.status, headers: headersObj, body, ok: r.ok }
        },
        {
          url: CART_PATCH_URL,
          token: authState.token,
          body: JSON.stringify([{
            op: 'add',
            path: '/items',
            value: {
              itemData: { url: `/fr/t/${SLUG}/${STYLE_COLOR}` },
              skuId: SKU_ID,
              quantity: 1,
            },
          }]),
        },
      )
      log('[addItem result]', { status: addRes.status, body: addRes.body.slice(0, 500) })

      if (addRes.ok) {
        const addedCart = JSON.parse(addRes.body) as CartShape
        cartItems = addedCart.items ?? []
        console.log(`  Cart now has ${cartItems.length} items`)
      }
    }

    // Use the first item for mutation tests
    if (cartItems.length > 0) {
      targetItem = cartItems[0]!
      targetItemId = targetItem.id
      console.log(`\n  Target item for tests: ${targetItemId}`)
    } else {
      console.error('[ERROR] Cannot proceed: cart is empty and addItem failed.')
      return
    }

    // Helper: fire a single PATCH variant and record result
    const tryVariant = async (label: string, ops: unknown[]): Promise<FetchResult> => {
      await sleep(DELAY_MS)
      console.log(`\n[VARIANT] ${label}`)
      const body = JSON.stringify(ops)
      console.log(`  Payload: ${body}`)

      const res = await page.evaluate(
        async (a: { url: string; token: string; body: string }): Promise<FetchResult> => {
          const r = await fetch(a.url, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json; charset=UTF-8',
              Authorization: 'Bearer ' + a.token,
            },
            body: a.body,
          })
          const headersObj: Record<string, string> = {}
          r.headers.forEach((v, k) => { headersObj[k] = v })
          let respBody = ''
          try { respBody = await r.text() } catch { respBody = '' }
          return { status: r.status, headers: headersObj, body: respBody, ok: r.ok }
        },
        { url: CART_PATCH_URL, token: authState.token, body },
      )

      const preview = res.body.slice(0, 300)
      console.log(`  Status: ${res.status} | Body: ${preview}`)
      results.push({ variant: label, status: res.status, bodyPreview: preview, success: res.ok })

      if (res.ok) {
        console.log(`  *** SUCCESS ${res.status} — CONTRACT FOUND! ***`)
      }

      return res
    }

    // Helper: verify item removed from cart
    const verifyRemoval = async (removedId: string): Promise<boolean> => {
      await sleep(DELAY_MS)
      const verRes = await page.evaluate(
        async (a: { url: string; token: string }): Promise<FetchResult> => {
          const r = await fetch(a.url, {
            method: 'GET',
            credentials: 'include',
            headers: { accept: 'application/json', Authorization: 'Bearer ' + a.token },
          })
          const headersObj: Record<string, string> = {}
          r.headers.forEach((v, k) => { headersObj[k] = v })
          let body = ''
          try { body = await r.text() } catch { body = '' }
          return { status: r.status, headers: headersObj, body, ok: r.ok }
        },
        { url: CART_GET_URL, token: authState.token },
      )

      if (!verRes.ok) return false
      const verCart = JSON.parse(verRes.body) as CartShape
      const still = (verCart.items ?? []).some((i) => i.id === removedId)
      if (!still) {
        console.log(`  *** VERIFIED: item ${removedId} is no longer in cart ***`)
        return true
      }
      console.log(`  Item ${removedId} still present in cart after mutation.`)
      return false
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BLOCK A: op:remove variants
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n\n' + '█'.repeat(70))
    console.log('BLOCK A: op:remove variants')
    console.log('█'.repeat(70))

    const escapedId = targetItemId.replace(/~/g, '~0').replace(/\//g, '~1')

    // A1: Pure RFC 6902 (no value) — known to return 400 MISSING_REQUIRED
    await tryVariant('A1: remove, path=/items/{id}, no value (pure RFC 6902)', [
      { op: 'remove', path: `/items/${escapedId}` },
    ])

    // A2: value: null — known to return 400 FIELD_INVALID
    await tryVariant('A2: remove, path=/items/{id}, value: null', [
      { op: 'remove', path: `/items/${escapedId}`, value: null },
    ])

    // A3: value: "" (empty string)
    await tryVariant('A3: remove, path=/items/{id}, value: ""', [
      { op: 'remove', path: `/items/${escapedId}`, value: '' },
    ])

    // A4: value: {} (empty object)
    await tryVariant('A4: remove, path=/items/{id}, value: {}', [
      { op: 'remove', path: `/items/${escapedId}`, value: {} },
    ])

    // A5: value: { id } at path /items (Nike non-standard)
    await tryVariant('A5: remove, path=/items, value: {id: itemId}', [
      { op: 'remove', path: '/items', value: { id: targetItemId } },
    ])

    // A6: value: itemId as string at path /items
    await tryVariant('A6: remove, path=/items, value: itemId (string)', [
      { op: 'remove', path: '/items', value: targetItemId },
    ])

    // A7: remove with path by numeric index (/items/0)
    await tryVariant('A7: remove, path=/items/0, no value', [
      { op: 'remove', path: '/items/0' },
    ])

    // A8: remove with path by numeric index (/items/0) + value: null
    await tryVariant('A8: remove, path=/items/0, value: null', [
      { op: 'remove', path: '/items/0', value: null },
    ])

    // A9: value is the full item object
    await tryVariant('A9: remove, path=/items/{id}, value: fullItemObject', [
      { op: 'remove', path: `/items/${escapedId}`, value: targetItem },
    ])

    // A10: Nike "delete" style — op:replace items array without the target item
    const remainingItems = cartItems.filter((i) => i.id !== targetItemId)
    await tryVariant('A10: replace /items with array minus target item', [
      { op: 'replace', path: '/items', value: remainingItems },
    ])

    // A11: Nike-style "delete" — value is array with just the id
    await tryVariant('A11: remove, path=/items, value: [itemId]', [
      { op: 'remove', path: '/items', value: [targetItemId] },
    ])

    // A12: value: { itemId } — Nike may expect itemId key
    await tryVariant('A12: remove, path=/items/{id}, value: {itemId: id}', [
      { op: 'remove', path: `/items/${escapedId}`, value: { itemId: targetItemId } },
    ])

    // Check if any remove variant worked and verify
    const successfulRemove = results.find((r) => r.success && r.variant.startsWith('A'))
    if (successfulRemove) {
      console.log(`\n[VERIFICATION] Testing removal with: ${successfulRemove.variant}`)
      await verifyRemoval(targetItemId)
    }

    // Re-add item if it was removed, to test setQuantity
    // Re-check cart state
    await sleep(DELAY_MS)
    const recheckRes = await page.evaluate(
      async (a: { url: string; token: string }): Promise<FetchResult> => {
        const r = await fetch(a.url, {
          method: 'GET',
          credentials: 'include',
          headers: { accept: 'application/json', Authorization: 'Bearer ' + a.token },
        })
        const headersObj: Record<string, string> = {}
        r.headers.forEach((v, k) => { headersObj[k] = v })
        let body = ''
        try { body = await r.text() } catch { body = '' }
        return { status: r.status, headers: headersObj, body, ok: r.ok }
      },
      { url: CART_GET_URL, token: authState.token },
    )

    let currentItems: CartItem[] = []
    if (recheckRes.ok) {
      const recheckCart = JSON.parse(recheckRes.body) as CartShape
      currentItems = recheckCart.items ?? []
    }

    if (currentItems.length === 0) {
      // Re-add item for setQuantity tests
      await sleep(DELAY_MS)
      const readdRes = await page.evaluate(
        async (a: { url: string; token: string; body: string }): Promise<FetchResult> => {
          const r = await fetch(a.url, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json; charset=UTF-8',
              Authorization: 'Bearer ' + a.token,
            },
            body: a.body,
          })
          const headersObj: Record<string, string> = {}
          r.headers.forEach((v, k) => { headersObj[k] = v })
          let body = ''
          try { body = await r.text() } catch { body = '' }
          return { status: r.status, headers: headersObj, body, ok: r.ok }
        },
        {
          url: CART_PATCH_URL,
          token: authState.token,
          body: JSON.stringify([{
            op: 'add',
            path: '/items',
            value: {
              itemData: { url: `/fr/t/${SLUG}/${STYLE_COLOR}` },
              skuId: SKU_ID,
              quantity: 1,
            },
          }]),
        },
      )

      if (readdRes.ok) {
        const readdCart = JSON.parse(readdRes.body) as CartShape
        currentItems = readdCart.items ?? []
      }
    }

    if (currentItems.length === 0) {
      console.log('\n[BLOCK B] Skipped — could not obtain a cart item for setQuantity tests')
    } else {
      const qItem = currentItems[0]!
      const qItemId = qItem.id
      const escapedQId = qItemId.replace(/~/g, '~0').replace(/\//g, '~1')

      // ──────────────────────────────────────────────────────────────────────
      // BLOCK B: op:replace/setQuantity variants
      // ──────────────────────────────────────────────────────────────────────
      console.log('\n\n' + '█'.repeat(70))
      console.log(`BLOCK B: op:replace (setQuantity) variants on item ${qItemId}`)
      console.log('█'.repeat(70))

      // B1: replace /items/{id}/quantity with numeric value (current impl)
      await tryVariant('B1: replace, path=/items/{id}/quantity, value: 2 (number)', [
        { op: 'replace', path: `/items/${escapedQId}/quantity`, value: 2 },
      ])

      // B2: replace /items/{id}/quantity with string value
      await tryVariant('B2: replace, path=/items/{id}/quantity, value: "2" (string)', [
        { op: 'replace', path: `/items/${escapedQId}/quantity`, value: '2' },
      ])

      // B3: replace /items/{id} with partial object containing quantity
      await tryVariant('B3: replace, path=/items/{id}, value: {quantity: 2}', [
        { op: 'replace', path: `/items/${escapedQId}`, value: { quantity: 2 } },
      ])

      // B4: replace /items/{id} with full item object (quantity bumped to 2)
      await tryVariant('B4: replace, path=/items/{id}, value: fullItem (qty=2)', [
        { op: 'replace', path: `/items/${escapedQId}`, value: { ...qItem, quantity: 2 } },
      ])

      // B5: Nike non-standard — quantity at path /items
      await tryVariant('B5: replace, path=/items, value: [{...item, quantity:2}]', [
        { op: 'replace', path: '/items', value: currentItems.map((i) => i.id === qItemId ? { ...i, quantity: 2 } : i) },
      ])

      // B6: quantity=0 with numeric value  (known to 400 but document)
      await tryVariant('B6: replace, path=/items/{id}/quantity, value: 0', [
        { op: 'replace', path: `/items/${escapedQId}/quantity`, value: 0 },
      ])

      // B7: quantity=0 with string "0"
      await tryVariant('B7: replace, path=/items/{id}/quantity, value: "0" (string)', [
        { op: 'replace', path: `/items/${escapedQId}/quantity`, value: '0' },
      ])

      // B8: merge op with quantity change
      await tryVariant('B8: merge, path=/items/{id}, value: {quantity: 2}', [
        { op: 'merge', path: `/items/${escapedQId}`, value: { quantity: 2 } },
      ])
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n\n' + '█'.repeat(70))
    console.log('FINAL SUMMARY')
    console.log('█'.repeat(70))
    console.log('\nVariant results:\n')
    for (const r of results) {
      const icon = r.success ? '✅' : '❌'
      console.log(`${icon}  [${r.status}]  ${r.variant}`)
      if (!r.success) {
        // Print error code if present
        const errMatch = r.bodyPreview.match(/"code"\s*:\s*"([^"]+)"/)
        if (errMatch) console.log(`         Error code: ${errMatch[1]}`)
      }
    }

    const successes = results.filter((r) => r.success)
    if (successes.length === 0) {
      console.log('\n⚠️  NO VARIANTS SUCCEEDED — research-blocked. All patterns rejected.')
      console.log('\nSee BLOCK A/B above for exact status codes and error messages per variant.')
    } else {
      console.log(`\n✅ ${successes.length} VARIANT(S) SUCCEEDED:`)
      for (const s of successes) {
        console.log(`   - ${s.variant}`)
      }
    }

    // Save results to a log file for story documentation
    const logPath = new URL('../scripts/poc-cart-mutations-results.json', import.meta.url).pathname
    const { writeFileSync } = await import('node:fs')
    writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), targetItemId, results }, null, 2))
    console.log(`\nResults saved to: ${logPath}`)

  } finally {
    await handle.close()
  }
}

main().catch((err) => {
  console.error('[POC 12.11] Fatal error:', err)
  process.exit(1)
})
