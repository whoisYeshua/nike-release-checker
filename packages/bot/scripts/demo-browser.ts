/**
 * DEMO VISUEL — Ouvre Chrome en mode visible sur Nike SNKRS FR.
 * Montre les techniques anti-bot: trajectoire Bezier, suppression modal,
 * navigation naturelle, hover d'éléments.
 *
 * Usage:
 *   node --import tsx packages/bot/scripts/demo-browser.ts
 *
 * Chrome reste ouvert 30s pour observer, puis se ferme.
 * Passe Ctrl+C pour fermer immédiatement.
 */
import { createStealthContext } from '../src/stealth/contextFactory.ts'
import { naturalClick, humanPause, humanScroll } from '../src/checkout/naturalClick.ts'

const DEMO_DURATION_MS = 60_000   // 60s d'observation avant fermeture auto

console.log('╔══════════════════════════════════════════════════════╗')
console.log('║  Nike Bot — DÉMO NAVIGATEUR VISIBLE                 ║')
console.log('╚══════════════════════════════════════════════════════╝')
console.log('')
console.log('  → Ouverture de Chrome en mode VISIBLE (non-headless)')
console.log('  → Le bot simule un vrai utilisateur humain:')
console.log('    - Trajectoire de souris Bezier (anti-Kasada)')
console.log('    - Pauses aléatoires entre actions')
console.log('    - Suppression automatique du modal cookies Nike')
console.log('    - navigator.webdriver masqué')
console.log('')
console.log('  Ctrl+C pour fermer à tout moment.')
console.log('')

const context = await createStealthContext({ headless: false })

// Graceful shutdown on Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n[demo] Fermeture...')
  await context.close()
  process.exit(0)
})

try {
  const page = await context.newPage()

  // ── Étape 1: Nike SNKRS FR ──────────────────────────────────────────
  console.log('[demo] Navigation vers Nike SNKRS FR...')
  await page.goto('https://www.nike.com/fr/snkrs', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })
  console.log('[demo] ✓ Page chargée: ' + page.url())

  // Pause humaine initiale (simule lecture de la page)
  await humanPause(page, 1500, 3000)

  // ── Étape 2: Scroll naturel ─────────────────────────────────────────
  console.log('[demo] Scroll naturel vers le bas (exploration produits)...')
  await humanScroll(page, 'down')
  await humanPause(page, 800, 1500)
  await humanScroll(page, 'down')
  await humanPause(page, 600, 1200)
  await humanScroll(page, 'down')
  await humanPause(page, 1000, 2000)

  // Scroll up pour revenir en haut
  console.log('[demo] Scroll retour vers le haut...')
  await humanScroll(page, 'up')
  await humanScroll(page, 'up')
  await humanPause(page, 800, 1400)

  // ── Étape 3: Hover sur une card produit ─────────────────────────────
  console.log('[demo] Recherche d\'une card produit à hover...')
  const productCard = page.locator('a[data-testid="product-card"], .product-card__link, a[href*="/fr/launch/t/"]').first()
  const box = await productCard.boundingBox().catch(() => null)

  if (box) {
    console.log(`[demo] ✓ Card trouvée à (${Math.round(box.x)}, ${Math.round(box.y)})`)
    console.log('[demo] Déplacement souris avec trajectoire Bezier...')
    await naturalClick(page, productCard)
    console.log('[demo] ✓ Clic naturel effectué')

    await humanPause(page, 2000, 4000)

    const newUrl = page.url()
    if (newUrl.includes('/launch/t/')) {
      console.log('[demo] ✓ Page produit ouverte: ' + newUrl)

      // ── Étape 4: Explorer la page produit ─────────────────────────
      console.log('[demo] Exploration de la page produit...')
      await humanScroll(page, 'down')
      await humanPause(page, 1000, 2000)

      // Essayer de hover sur les tailles disponibles
      const sizeBtn = page.locator('[data-testid*="size"], button[aria-label*="taille"], button[aria-label*="size"]').first()
      const sizeBtnBox = await sizeBtn.boundingBox().catch(() => null)
      if (sizeBtnBox) {
        console.log('[demo] Hover sur un bouton taille...')
        await page.mouse.move(sizeBtnBox.x + sizeBtnBox.width / 2, sizeBtnBox.y + sizeBtnBox.height / 2)
        await humanPause(page, 500, 1000)
      }
    } else {
      console.log('[demo] Navigation sur: ' + newUrl)
    }
  } else {
    console.log('[demo] ⚠ Aucune card produit trouvée (page peut-être différente)')
    // Screenshot pour debug
    await page.screenshot({ path: '/tmp/nike-demo-snkrs.png' })
    console.log('[demo] Screenshot sauvé dans /tmp/nike-demo-snkrs.png')
  }

  // ── Résumé fingerprint ─────────────────────────────────────────────
  console.log('')
  console.log('[demo] Vérification du fingerprint anti-bot...')
  const fingerprint = await page.evaluate(() => ({
    webdriver: (navigator as any).webdriver,
    plugins: Array.from(navigator.plugins).length,
    languages: navigator.languages,
    userAgent: navigator.userAgent.slice(0, 60) + '...',
  }))
  console.log('[demo]   navigator.webdriver =', fingerprint.webdriver, '(undefined = pas de bot signal)')
  console.log('[demo]   navigator.plugins =', fingerprint.plugins, 'plugins')
  console.log('[demo]   navigator.languages =', JSON.stringify(fingerprint.languages))
  console.log('[demo]   userAgent = ' + fingerprint.userAgent)

  console.log('')
  console.log(`[demo] Navigateur ouvert pendant ${DEMO_DURATION_MS / 1000}s — observe le résultat!`)
  console.log('[demo] Ctrl+C pour fermer immédiatement.')

  await new Promise((r) => setTimeout(r, DEMO_DURATION_MS))
  console.log('[demo] Temps écoulé — fermeture automatique.')
} finally {
  await context.close()
  console.log('[demo] ✓ Chrome fermé proprement.')
}
