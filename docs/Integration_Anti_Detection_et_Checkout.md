# Intégration Anti-Détection et Logique de Checkout (SNKRS)

## 1. Analyse du Projet Actuel (Anti-Détection)
Suite à l'analyse du projet `whoisYeshua/nike-release-checker` (y compris les 100 derniers commits et le code source du SDK/CLI), **il n'y a actuellement aucun système d'anti-détection intégré.**  
Les appels API utilisent la fonction native `fetch` (voir `packages/sdk/utils/jsonRequest.ts`), sans rotation de User-Agent dynamique, sans modification d'entêtes (headers TLS/HTTP/2) spoofés, ni gestion des défis Cloudflare/Akamai. Cela signifie que bien que le projet soit fonctionnel pour du monitoring à faible fréquence, il sera très rapidement bloqué (HTTP 403 / 429) lors d'une automatisation d'achat massive ou agressive.

## 2. Système Anti-Détection à Intégrer
Pour garantir la furtivité du bot, nous allons hybrider la solution avec les outils identifiés lors de nos précédentes sessions (inspirés des scripts `anti_detect.py` et du bypass Turnstile) :

1. **Monitoring (SDK)** :  
   - Remplacement partiel de `fetch` par un outil capable de faire du *TLS Fingerprinting spoofing* (ex: `got-scraping` en Node.js, ou passage des requêtes via les sessions Playwright) pour contourner les blocages API.
2. **Paiement (Checkout) avec Playwright Stealth** :  
   - Utilisation de `playwright-extra` + `puppeteer-extra-plugin-stealth` pour injecter les variables de navigation humaines simulées (WebGL, canvas, masquage de `webdriver=true`).
   - Logique de bypass du **Shadow DOM** pour les iframes Turnstile/Cloudflare, comme vu dans les repos Python analysés.

## 3. Configuration des Comptes & Gestion des Pays
Le fichier de configuration des comptes sera au format JSON (plus flexible) ou TXT riche.  
Il inclura impérativement le **pays** pour chaque compte, ce qui permettra au SDK de cibler automatiquement les bons endpoints (`region` locale) sans conflit.

**Format suggéré (`accounts.json`) :**
```json
[
  {
    "id": "account_1",
    "email": "user1@example.com",
    "password": "Password123!",
    "proxy": "http://user:pass@proxy.residential.com:8080",
    "country": "FR",
    "preferred_sizes": ["10", "10.5", "11"],
    "slug": "air-jordan-1-high-og-lost-and-found",
    "payment_method": "PRE_SAVED_CC"
  }
]
```

## 4. Logique de la Boucle d'Achat (Checkout Loop)

Cette boucle doit être rapide et impitoyable. Voici le flux d'exécution :

1. **Initialisation (Pre-Check)** : 
   - Le CLI charge la liste des comptes.
   - Les contextes Playwright (navigateurs invisibles) sont pré-amorcés avec les proxies et les cookies de session injectés.
   - Les navigateurs sont placés "en attente" pour ne pas perdre de temps au déclenchement.
2. **Surveillance (Monitor)** : 
   - Le SDK Node.js effectue un polling du flux produit (Product Feed API Nike).
   - Le pays interrogé correspond au pays de la tâche (par ex: `FR`).
3. **Déclenchement (Trigger)** : 
   - Dès que le niveau de stock (`stockLevel`) pour la taille désirée passe en `HIGH` (ou `MEDIUM`).
4. **Action (Checkout rapide)** :
   - Étape 1 : Le contexte Playwright pré-amorcé cible l'URL du produit.
   - Étape 2 : Clic immédiat sur la taille souhaitée.
   - Étape 3 : Clic sur le bouton "Ajouter au Panier" (ou "Acheter maintenant" selon la release).
   - Étape 4 : Redirection fluide vers le process de Checkout.
   - Étape 5 : L'adresse de livraison et la carte bancaire (préenregistrées) sont sélectionnées par défaut par Nike.
   - Étape 6 : **Clic sur "Soumettre le paiement" (Submit Order)**.
   - Étape 7 : Interception d'une éventuelle iframe 3D Secure côté banque pour notification/résolution manuelle en urgence via Webhook.

## 5. Commandes CLI à Intégrer

Afin que le CLI reste propre et professionnel, nous intégrerons la librairie existante avec de nouvelles commandes sous un namespace `bot`.

### Commandes CLI proposées :

* **Importer des comptes dans la base locale sécurisée** :
  `nike-release-checker bot import-accounts --file accounts.json`

* **Générer/Rafraîchir les sessions de connexion (récupération des cookies)** :
  `nike-release-checker bot login-all`

* **Lancer la boucle de surveillance (Task/Sniper mode)** :
  `nike-release-checker bot start --slug "travis-scott-jordan-1" --auto-checkout`

* **Mode Test / Checkout rapide** :
  `nike-release-checker bot dry-run --slug "nike-air-force-1" --profile account_1`
