# Sélecteurs CSS pour l'Automatisation de Connexion (Nike SNKRS)

Basé sur l'analyse de la page de connexion Nike (`https://accounts.nike.com/`), voici les sélecteurs CSS précis à utiliser pour Playwright.

## 1. Étape 1 : Saisie de l'E-mail
- **Champ Saisie E-mail** :
  - **CSS Selectors** : `input[type="email"]`, `#username`, ou `input[name="credential"]`
  - **Description** : Champ principal affiché au chargement de la modale de connexion.
- **Bouton Continuer** :
  - **CSS Selectors** : `button[type="submit"]` ou `button.btn-primary-dark`
  - **Description** : Cliqué après avoir saisi l'adresse e-mail (`candid_audio.0s@icloud.com`) pour révéler le champ du mot de passe.

## 2. Étape 2 : Saisie du Mot de Passe
- **Champ Saisie Mot de Passe** :
  - **CSS Selectors** : `input[type="password"]`, `#password`, ou `input[name="password"]`
  - **Description** : Souvent caché initialement (`hidden=""`), ce champ devient interactif après la validation de l'e-mail.
- **Bouton de Connexion (Submit)** :
  - **CSS Selectors** : `button[type="submit"]`
  - **Description** : Valide le mot de passe pour générer le cookie/token d'authentification.

---
**Identifiant assigné (Test)** : `candid_audio.0s@icloud.com`
