# Installer Nike Bot

Le bot est livré comme une application autonome. Il contient déjà Node.js,
toutes les dépendances et le navigateur Chromium configuré pour ne pas être
détecté par Nike. **Aucune installation préalable n'est nécessaire.**

---

## macOS

1. Téléchargez le fichier `.dmg` correspondant à votre Mac :
   - **Apple Silicon (M1/M2/M3/M4)** → `Nike Bot-x.y.z-macos-arm64.dmg`
   - **Intel** → `Nike Bot-x.y.z-macos-x64.dmg`
   - Pour savoir lequel : menu Pomme  → À propos de ce Mac → Puce.
2. Double-cliquez sur le `.dmg`, glissez `Nike Bot` dans **Applications**.
3. Première ouverture : clic droit sur l'icône → **Ouvrir** (macOS demande
   confirmation pour une app non signée par Apple, c'est normal).
4. Un Terminal s'ouvre tout seul → l'assistant interactif (`init`) démarre.

L'assistant vous guide pour :
- créer / importer vos comptes Nike (CSV simple),
- ajouter vos cartes de paiement (chiffrées localement, jamais transmises),
- configurer vos proxies,
- capturer une session navigateur par compte,
- valider tout via un dry-run.

---

## Linux

1. Téléchargez `nike-bot-x.y.z-linux-x64.tar.gz` (ou `linux-arm64`).
2. Extraire :
   ```bash
   tar -xzf nike-bot-*-linux-*.tar.gz
   cd nike-bot-linux-*
   ```
3. Lancer :
   ```bash
   ./nike-bot.sh
   ```
   Au premier lancement, l'assistant interactif `init` démarre.

---

## Windows

1. Téléchargez `nike-bot-x.y.z-windows-x64.zip`.
2. Faites clic droit sur le ZIP → **Extraire tout**.
3. Ouvrez le dossier extrait, **double-cliquez sur `Nike Bot.cmd`**.
4. Une fenêtre console s'ouvre → l'assistant interactif démarre.

> Si Windows SmartScreen bloque l'exécution, cliquez sur "Informations
> complémentaires" → "Exécuter quand même".

---

## Données utilisateur

Toute la configuration et les sessions sont stockées dans :

| Plateforme | Dossier                         |
|------------|---------------------------------|
| macOS      | `~/.nike-bot/`                  |
| Linux      | `~/.nike-bot/`                  |
| Windows    | `%USERPROFILE%\.nike-bot\`      |

L'application elle-même reste en lecture seule. Vous pouvez la déplacer ou
la supprimer sans perdre vos comptes / sessions.

---

## Mise à jour

Téléchargez la nouvelle version, remplacez l'app/le dossier. Les données
utilisateur dans `~/.nike-bot/` sont conservées.

---

## Support

- README technique complet : [`README.md`](./README.md)
- Premier lancement : [`docs/FIRST_LAUNCH.md`](../../docs/FIRST_LAUNCH.md)
- Issues : ouvrez un ticket sur le dépôt GitHub.
