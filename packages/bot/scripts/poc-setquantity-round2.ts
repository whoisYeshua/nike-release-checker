/**
 * POC Round 2: setQuantity — Nike PATCH cart quantity change
 * Testing Nike-specific patterns we haven't tried yet.
 *
 * The `op:remove, path=/items, value:{id}` worked for remove.
 * By analogy, Nike may use a non-standard path for quantity updates.
 *
 * Usage:
 *   node --import tsx packages/bot/scripts/poc-setquantity-round2.ts
 */

import { createRealCheckoutContext } from '../src/stealth/realCheckoutContext.ts'

const ACCOUNT_ID = 'candid_audio'
const PDP_URL = 'https://www.nike.com/fr/t/chaussure-air-force-1-07-pour-ojDkV4tL/CW2288-111'
const SKU_ID = 'd0ca4bf1-a90c-5bdf-a518-997275341a24'
const SLUG = 'chaussure-air-force-1-07-pour-ojDkV4tL'
const STYLE_COLOR = 'CW2288-111'
const CART_PATCH_URL =
  'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM?modifiers=VALIDATELIMITS,VALIDATEAVAILABILITY'
const CART_GET_URL = 'https://api.nike.com/buy/carts/v2/FR/NIKE/NIKECOM'
const DELAY_MS = 600

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

interface FetchResult {
  status: number
  headers: Record<string, string>
  body: string
  ok: boolean
}
interface CartItem {
  id: string
  skuId: string
  quantity: number
  itemData?: { url?: string }
  offers?: unknown[]
  valueAddedServices?: unknown[]
}
interface CartShape {
  id?: string
  items?: CartItem[]
}

async function main() {
  console.log('[Round 2] setQuantity contract discovery')
  const handle = await createRealCheckoutContext({ accountId: ACCOUNT_ID, headless: false })
  const results: Array<{ variant: string; status: number; bodyPreview: string; success: boolean }> = []

  try {
    const page = handle.context.pages()[0] ?? (await handle.context.newPage())

    await page.goto(PDP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    try {
      await page.waitForFunction(
        () => typeof (window as unknown as Record<string, unknown>)['KPSDK'] !== 'undefined',
        { timeout: 8_000 },
      )
    } catch {
      await sleep(3_000)
    }
    await sleep(2_000)

    const authState = await page.evaluate(() => {
      const ls = window.localStorage
      const oidcKey = Object.keys(ls).find((k) => k.startsWith('oidc.user:'))
      if (!oidcKey) return { token: null }
      const raw = ls.getItem(oidcKey)
      if (!raw) return { token: null }
      try {
        return { token: ((JSON.parse(raw) as Record<string, unknown>)['access_token'] as string) ?? null }
      } catch {
        return { token: null }
      }
    })

    if (!authState.token) {
      console.error('No OIDC token')
      return
    }
    console.log(`Bearer: ***${authState.token.slice(-8)}`)

    const token = authState.token

    const getCart = async (): Promise<CartItem[]> => {
      const r = await page.evaluate(
        async (a: { url: string; token: string }): Promise<FetchResult> => {
          const resp = await fetch(a.url, {
            method: 'GET',
            credentials: 'include',
            headers: { accept: 'application/json', Authorization: 'Bearer ' + a.token },
          })
          const h: Record<string, string> = {}
          resp.headers.forEach((v, k) => {
            h[k] = v
          })
          let body = ''
          try {
            body = await resp.text()
          } catch {}
          return { status: resp.status, headers: h, body, ok: resp.ok }
        },
        { url: CART_GET_URL, token },
      )
      if (!r.ok) return []
      return (JSON.parse(r.body) as CartShape).items ?? []
    }

    const patch = async (ops: unknown[]): Promise<FetchResult> => {
      const r = await page.evaluate(
        async (a: { url: string; token: string; body: string }): Promise<FetchResult> => {
          const resp = await fetch(a.url, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json; charset=UTF-8',
              Authorization: 'Bearer ' + a.token,
            },
            body: a.body,
          })
          const h: Record<string, string> = {}
          resp.headers.forEach((v, k) => {
            h[k] = v
          })
          let body = ''
          try {
            body = await resp.text()
          } catch {}
          return { status: resp.status, headers: h, body, ok: resp.ok }
        },
        { url: CART_PATCH_URL, token, body: JSON.stringify(ops) },
      )
      return r
    }

    const tryVariant = async (label: string, ops: unknown[]): Promise<FetchResult> => {
      await sleep(DELAY_MS)
      console.log(`\n[VARIANT] ${label}`)
      console.log(`  Payload: ${JSON.stringify(ops).slice(0, 300)}`)
      const res = await patch(ops)
      const preview = res.body.slice(0, 400)
      console.log(`  Status: ${res.status} | ${preview}`)
      results.push({ variant: label, status: res.status, bodyPreview: preview, success: res.ok })
      if (res.ok) console.log('  *** SUCCESS ***')
      return res
    }

    // Ensure we have an item
    let items = await getCart()
    if (items.length === 0) {
      console.log('Adding item...')
      await sleep(DELAY_MS)
      const addRes = await patch([{
        op: 'add',
        path: '/items',
        value: { itemData: { url: `/fr/t/${SLUG}/${STYLE_COLOR}` }, skuId: SKU_ID, quantity: 1 },
      }])
      if (addRes.ok) items = (JSON.parse(addRes.body) as CartShape).items ?? []
    }

    if (items.length === 0) {
      console.error('Cart empty, cannot proceed')
      return
    }

    const item = items[0]!
    const id = item.id
    const esc = id.replace(/~/g, '~0').replace(/\//g, '~1')
    console.log(`\nTarget item: ${id} (qty: ${item.quantity})`)

    // Analogy with removeItem success: path=/items, value={id}
    // For replace: try path=/items, value={id, quantity}
    await tryVariant('C1: replace, path=/items, value: {id, quantity:2}', [
      { op: 'replace', path: '/items', value: { id, quantity: 2 } },
    ])

    // Nike may use "add" to update quantity (upsert behavior)
    await tryVariant('C2: add, path=/items, value: {skuId, quantity:2, itemData} (upsert)', [
      { op: 'add', path: '/items', value: { skuId: item.skuId, quantity: 2, itemData: item.itemData ?? {} } },
    ])

    // merge op on /items with {id, quantity}
    await tryVariant('C3: merge, path=/items, value: {id, quantity:2}', [
      { op: 'merge', path: '/items', value: { id, quantity: 2 } },
    ])

    // merge op on the item path directly
    await tryVariant('C4: merge, path=/items/{id}, value: {quantity:2}', [
      { op: 'merge', path: `/items/${esc}`, value: { quantity: 2 } },
    ])

    // update (non-standard op)
    await tryVariant('C5: update (non-standard), path=/items/{id}, value: {quantity:2}', [
      { op: 'update', path: `/items/${esc}`, value: { quantity: 2 } },
    ])

    // patch (non-standard op)
    await tryVariant('C6: patch (non-standard), path=/items/{id}, value: {quantity:2}', [
      { op: 'patch', path: `/items/${esc}`, value: { quantity: 2 } },
    ])

    // add on the item path (like upsert)
    await tryVariant('C7: add, path=/items/{id}, value: {quantity:2}', [
      { op: 'add', path: `/items/${esc}`, value: { quantity: 2 } },
    ])

    // replace on /items with {id, skuId, quantity}
    await tryVariant('C8: replace, path=/items, value: {id, skuId, quantity:2}', [
      { op: 'replace', path: '/items', value: { id, skuId: item.skuId, quantity: 2 } },
    ])

    // add again with same SKU but different quantity — Nike may treat it as upsert
    await tryVariant('C9: add, path=/items, value: {skuId, quantity:3} no itemData', [
      { op: 'add', path: '/items', value: { skuId: item.skuId, quantity: 3 } },
    ])

    // merge at root with items array
    await tryVariant('C10: merge, path=/, value: {items:[{id, quantity:2}]}', [
      { op: 'merge', path: '/', value: { items: [{ id, quantity: 2 }] } },
    ])

    // remove by id then add back with new quantity (two-op transaction)
    await tryVariant('C11: [remove path=/items value:{id}] + [add path=/items value:{skuId, qty:2}]', [
      { op: 'remove', path: '/items', value: { id } },
      { op: 'add', path: '/items', value: { skuId: item.skuId, quantity: 2, itemData: item.itemData ?? {} } },
    ])

    console.log('\n\nFINAL SUMMARY')
    console.log('='.repeat(60))
    for (const r of results) {
      const icon = r.success ? '✅' : '❌'
      const errCode = r.bodyPreview.match(/"code"\s*:\s*"([^"]+)"/)?.[1] ?? ''
      console.log(`${icon}  [${r.status}]  ${r.variant}${errCode ? ' — ' + errCode : ''}`)
    }

    const successes = results.filter((r) => r.success)
    if (successes.length === 0) {
      console.log('\n⚠️  ALL setQuantity variants FAILED — research-blocked for setQuantity.')
    } else {
      console.log(`\n✅ SUCCESS: ${successes.map((s) => s.variant).join(', ')}`)
      for (const s of successes) {
        console.log(`\n  BODY: ${s.bodyPreview}`)
      }
    }
  } finally {
    await handle.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
