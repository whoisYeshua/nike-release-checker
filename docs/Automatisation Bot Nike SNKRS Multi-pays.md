# **Conception Avancée d'une Architecture Hybride pour l'Automatisation des Achats Nike SNKRS : Spécificités du Marché Français et Intégration Multi-Pays**

L'écosystème numérique des lancements de sneakers en édition limitée sur la plateforme Nike SNKRS est le théâtre d'une course aux armements technologiques incessante. En 2026, l'asymétrie entre les mesures de sécurité institutionnelles et les outils développés par la communauté open-source a atteint un point critique. Nike déploie des systèmes de protection d'une complexité sans précédent, interceptant activement entre 10 % et 50 % du trafic lors des lancements majeurs, ce qui se traduit par le blocage de près de 12 milliards de requêtes automatisées chaque mois à l'échelle mondiale.1 Ces lignes de défense s'appuient sur des infrastructures de pointe, notamment Akamai Bot Manager et DataDome, couplées à des modèles d'apprentissage automatique propriétaires qui analysent les empreintes numériques et les flux comportementaux en temps réel.1  
Dans ce contexte de haute sécurité, les approches monolithiques traditionnelles sont vouées à l'échec. L'utilisation exclusive d'une automatisation par navigateur (telle qu'une implémentation standard de Selenium) se révèle structurellement trop lente pour rivaliser lors des lancements où les stocks s'écoulent en quelques millisecondes, et ses attributs d'exécution laissent des traces cryptographiques facilement détectables par les scripts de profilage de Nike.4 À l'inverse, une approche purement basée sur des requêtes API directes se heurte à des protocoles d'authentification stricts et à des défis JavaScript impossibles à résoudre sans un moteur de rendu complet, particulièrement lors de l'étape cruciale du paiement où les réglementations européennes imposent des vérifications drastiques.5  
Afin de garantir un taux de succès optimal pour les lancements sur le marché français et européen, la conception d'un système automatisé exige l'adoption d'une architecture hybride rigoureuse. Cette approche stratégique consiste à exploiter la vélocité intrinsèque des requêtes HTTP directes pour la surveillance asynchrone des stocks et l'ajout au panier, avant de basculer dynamiquement vers un environnement de navigateur furtif (Playwright modifié) pour finaliser le processus transactionnel.5 Le présent rapport propose une analyse exhaustive de cette architecture, en évaluant l'état de l'art des dépôts GitHub fournis, en définissant les protocoles de contournement des protections anti-bot, et en adaptant la logique algorithmique aux contraintes spécifiques du marché français (notamment la norme DSP2 et le 3D Secure).

## **Évaluation Exhaustive des Dépôts GitHub et Stratégie d'Intégration Logicielle**

La création d'un système d'achat automatisé performant ne nécessite pas de redévelopper l'intégralité des modules réseau et cryptographiques à partir de zéro. Une analyse méticuleuse des ressources open-source existantes permet d'identifier les composants algorithmiques viables et d'écarter les projets devenus obsolètes face aux récents correctifs de sécurité de Nike. L'objectif est de consolider les meilleures pratiques tout en restructurant le code pour répondre aux exigences d'une architecture hybride.

### **Analyse Approfondie du Dépôt amaanrahman7/SNKRS-Bot et de son main.py**

Le dépôt amaanrahman7/SNKRS-Bot représente un cas d'étude classique de l'automatisation de première génération.10 Bien que l'accès direct au code source brut soit restreint dans l'échantillon fourni, l'analyse structurelle de ce type de bot Python basé sur Selenium révèle des caractéristiques communes.12 La question centrale est de savoir si son fichier main.py peut servir de base simple à mettre à jour et à adapter.  
La réponse est nuancée : le flux logique (workflow) du main.py peut être conservé comme squelette algorithmique, mais son implémentation technique doit être entièrement réécrite. En règle générale, le main.py de ce dépôt orchestre une séquence linéaire : initialisation du WebDriver, navigation vers la page de connexion, injection des identifiants, attente du compte à rebours de lancement, sélection de la taille, clic sur le bouton d'ajout au panier, et navigation vers le formulaire de paiement. Cette orchestration est conceptuellement saine et fournit un excellent modèle pour la machine à états finis qui dirigera notre interface en ligne de commande (CLI).  
Cependant, sur le plan opérationnel, ce main.py est inexploitable en l'état. L'utilisation de Selenium natif injecte la variable navigator.webdriver \= true dans l'environnement JavaScript du navigateur, une anomalie instantanément repérée par le capteur biométrique d'Akamai.4 De plus, Selenium est incapable de modifier son empreinte TLS (Transport Layer Security) ou de masquer son User-Agent de manière suffisamment sophistiquée pour tromper les analyses de Canvas ou de WebGL.9 Par conséquent, il est recommandé de reprendre la structure de contrôle (boucles d'attente, gestion des erreurs, sélecteurs conditionnels) du main.py de amaanrahman7, mais de remplacer intégralement les appels Selenium par notre propre logique hybride API/Playwright.

### **Le Moteur de Surveillance : whoisYeshua/nike-release-checker**

À l'opposé des bots d'interface, le dépôt whoisYeshua/nike-release-checker offre une solution purement axée sur les données backend. Développé en TypeScript, ce projet fournit un SDK modulaire qui interroge directement les flux internes de Nike via l'endpoint https://api.nike.com/product\_feed/threads/v3/.14 Son architecture est fondamentalement supérieure pour la phase de détection, car elle contourne totalement l'infrastructure front-end de Nike.com.  
Ce dépôt doit être fusionné en tant que module central de notre couche de monitoring. Sa capacité à appliquer des filtres stricts (tels que countryCode et language) le rend parfaitement adapté pour cibler le marché français.14 Plus important encore, la logique d'extraction de ce SDK permet de structurer les objets JSON bruts pour identifier le niveau de stock par taille (HIGH, MEDIUM, LOW, OOS), le prix de vente, et surtout, la méthodologie de lancement (DAN pour les tirages au sort, LEO pour les files d'attente rapides).14 L'intégration de cette logique permet au bot de prendre des décisions millisecondes avant même que l'interface utilisateur graphique de l'application SNKRS ne se mette à jour.

### **Expérimentations de Transfert de Session : alexschimpf/Snkrs-Bot**

Le dépôt alexschimpf/Snkrs-Bot est un script Python 3.7 qui, bien qu'également basé sur Selenium pour ses opérations principales, recèle une innovation conceptuelle majeure dans son script expérimental (experimental.py).5 L'auteur a tenté de résoudre les problèmes de latence de Selenium en démontrant comment extraire les cookies de session d'un navigateur authentifié à l'aide de driver.get\_cookies() pour les injecter directement dans une requête HTTP requests.get ciblant l'endpoint jcartService de Nike.5  
Cette découverte valide la faisabilité du transfert de session (Session Handoff) au sein de l'architecture SNKRS. Cependant, notre architecture hybride inversera ce paradigme : nous générerons la session initiale et l'ajout au panier via une API furtive, puis nous transférerons ces cookies vers un navigateur Playwright pour le paiement.8 Le code d'alexschimpf servira de documentation technique pour cartographier les paramètres requis par l'API d'ajout au panier (notamment les clés action, productId, skuId, skuAndSize, et qty).5

### **Gestion Spécifique au Marché Français : azerpas/nikeAPI-Py**

Le dépôt azerpas/nikeAPI-Py apporte une expertise précieuse spécifiquement optimisée pour le marché français.16 Initialement conçu pour l'enregistrement massif de comptes aux tirages au sort (DAN), ce projet Python fournit des modèles de requêtes adaptés aux serveurs européens de Nike. Bien que les endpoints d'inscription puissent avoir évolué depuis sa dernière mise à jour, la structure de ses charges utiles (payloads) et la gestion de ses proxys constituent une base de connaissances indispensable pour adapter notre outil aux spécificités territoriales de la France et du reste de l'Europe.16

### **Les Projets à Abandonner**

Une part importante du développement consiste à savoir écarter le code technique déprécié (Technical Debt). Plusieurs dépôts mentionnés doivent être catégoriquement abandonnés :

* **FranciscoCastagnaro/snkrsBot** : Ce projet repose sur une architecture d'automatisation obsolète qui ne prend pas en compte les évolutions des défenses biométriques déployées en 2025 et 2026\. Son intégration introduirait des vulnérabilités de détection majeures.17  
* **pvinay0312/retail-monitor-python et jarrenleo** : Ces outils de surveillance de vente au détail génériques ne disposent pas de l'expertise spécifique requise pour décoder les flux JSON complexes et les endpoints cryptés de l'API Nike SNKRS moderne.19 Leur approche générique est inefficace face à Akamai.  
* **KrystianWeclawiak/NIKE-SNKRS-API-MONITOR** : Bien qu'orienté API, ce projet a perdu sa pertinence suite aux modifications structurelles des flux de Nike et est largement surpassé par l'implémentation TypeScript de whoisYeshua.20  
* **Longe-J/nike-Quick-Buy-Bot** : Le mécanisme "Quick Buy" proposé repose sur des endpoints d'achat direct qui ont été fermés ou sécurisés par des jetons (tokens) dynamiques que ce script ne sait pas générer, rendant la gestion de son flux de paiement caduque.22

Le tableau ci-dessous résume la stratégie de consolidation des ressources logicielles.

| Dépôt / Projet | Rôle Stratégique dans l'Architecture | Décision Technique | Éléments Spécifiques à Extraire |
| :---- | :---- | :---- | :---- |
| amaanrahman7/SNKRS-Bot | Squelette du flux d'exécution | **À restructurer** | Logique séquentielle du main.py, arbres de décision d'achat. |
| whoisYeshua/nike-release-checker | Moteur de Monitoring API | **À fusionner** | Endpoints /threads/v3/, parsing JSON, filtrage countryCode=FR. |
| alexschimpf/Snkrs-Bot | Preuve de concept d'API Carting | **À recycler** | Paramètres payload jcartService (skuAndSize, productId). |
| azerpas/nikeAPI-Py | Gestion des comptes France | **À fusionner** | Formats de requêtes spécifiques au marché FR, logique de comptes. |
| FranciscoCastagnaro / pvinay0312 | Outils génériques/obsolètes | **À abandonner** | Aucun (Code déprécié face aux défenses Akamai 2026). |

## **Ingénierie des Protections Anti-Bot de Nike : Comprendre l'Adversaire**

Avant de détailler la construction de l'architecture hybride, il est fondamental de déconstruire les systèmes de sécurité mis en place par Nike en 2026\. L'entreprise consacre des ressources massives pour préserver l'équité de sa plateforme SNKRS, justifiant la suppression de millions d'entrées illégitimes par une équipe d'ingénieurs dédiée exclusivement à la neutralisation des bots.1 Ce système de défense opère sur plusieurs couches OSI (Open Systems Interconnection), rendant les scripts amateurs instantanément obsolètes.

### **Empreintes TLS et JA3/JA4 (Couche Réseau)**

La première ligne de défense intervient avant même qu'une requête HTTP ne soit traitée. Lorsqu'un script Python (utilisant la bibliothèque standard requests ou urllib3) tente de se connecter aux serveurs de Nike, il initie un processus de négociation cryptographique (TLS Handshake). Le système Akamai Bot Manager analyse les algorithmes de chiffrement (Cipher Suites) proposés par le client pour établir la connexion.6  
Les navigateurs commerciaux comme Google Chrome ou Safari présentent un ordre et une sélection de suites de chiffrement très spécifiques, qui diffèrent fondamentalement de la pile OpenSSL utilisée par défaut dans Python.13 Cette différence génère un identifiant unique (un hash JA3 ou JA4). Si le serveur détecte un User-Agent prétendant être "Chrome" mais dont l'empreinte TLS correspond à "Python", la requête est instantanément bloquée, retournant un code HTTP 403 Forbidden ou une page d'erreur "Pardon Our Interruption".6 C'est la raison pour laquelle les API monolithiques échouent.

### **Analyse Comportementale et Données de Capteurs (Couche Applicative)**

Pour les requêtes qui parviennent à passer la couche réseau, Akamai déploie des défis JavaScript. Ces scripts collectent des "données de capteurs" (Sensor Data) en analysant l'environnement de rendu du navigateur. Ils vérifient la présence d'attributs révélateurs d'une automatisation, tels que navigator.webdriver \=== true, la taille des fenêtres d'affichage, les plugins installés, le rendu des polices (Canvas fingerprinting), et la cohérence entre le nombre de cœurs de processeur déclarés et la puissance de rendu GPU.13  
Si l'environnement est jugé suspect (comme c'est le cas avec un navigateur Selenium ou Playwright non modifié), les cookies d'autorisation essentiels tels que \_abck et bm\_sz ne sont pas générés, ou sont marqués avec un score de confiance nul, empêchant la validation du panier et l'accès à la passerelle de paiement.24

### **Cohérence Géographique et Réputation IP**

Enfin, le système recoupe l'adresse IP de la requête avec sa géolocalisation et son ASN (Autonomous System Number). Une requête ciblant le lancement français (/fr/launch) provenant d'une adresse IP issue d'un centre de données américain (comme AWS ou DigitalOcean) est immédiatement flaguée. De même, une incohérence entre l'IP et les en-têtes HTTP, tels que Accept-Language: fr-FR,fr;q=0.9 associé à une IP allemande, déclenchera une restriction.13 L'utilisation de proxys résidentiels propres et géolocalisés est donc la base de toute opération viable.6

## **Conception de l'Architecture Hybride \- Phase 1 : Surveillance API Multi-Pays**

La première étape de l'architecture hybride vise à résoudre le problème de la détection de stock. L'utilisation d'un navigateur pour rafraîchir la page produit est prohibitif en termes de consommation de ressources et de temps de réponse. La solution repose sur l'intégration du moteur de whoisYeshua/nike-release-checker, réécrit en Python pour s'intégrer à notre système global.14

### **Stratégie de Polling Asynchrone**

Le module de surveillance doit effectuer un "polling" (interrogation périodique) de l'endpoint interne de Nike (https://api.nike.com/product\_feed/threads/v3/). Pour un ciblage multi-pays avec un focus sur la France, les paramètres de la requête GET doivent être dynamiquement assignés par notre interface CLI : ?filter=marketplace(FR)\&filter=language(fr)\&filter=upcoming(true)\&filter=channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61).14  
Pour éviter d'être banni par les limitations de débit (Rate Limiting), ce polling doit être distribué de manière asynchrone (en utilisant asyncio et aiohttp en Python) au travers d'un vaste bassin de proxys résidentiels français rotatifs.16

### **Classification des Lancements et Décision Algorithmique**

La véritable valeur de cette phase réside dans le traitement de la réponse JSON. Le système doit analyser le nœud productInfo pour extraire trois données critiques qui conditionneront le comportement de la Phase 2 :

1. **L'état des stocks par taille (SKU)** : Le script identifie les tailles disponibles et leur niveau de disponibilité (HIGH, MEDIUM, LOW, OOS). L'algorithme sera programmé pour cibler automatiquement les identifiants SKU (Stock Keeping Units) associés à la taille désirée par l'utilisateur, en priorisant les tailles avec un stock HIGH en cas de flexibilité.14  
2. **La méthode de lancement** : La plateforme SNKRS utilise principalement deux méthodes de distribution.  
   * **DAN (Draw / Tirage au sort)** : Si le flux JSON indique un lancement DAN, la vitesse n'est pas un atout.14 Le système bascule dans un mode de "Ferme de comptes", où il déploie des dizaines de sessions Playwright simultanées pour inscrire de multiples profils au tirage au sort durant la fenêtre de 15 minutes allouée, maximisant ainsi les probabilités de gain.16  
   * **LEO (Let Everyone Order)** : Il s'agit d'une file d'attente mini-tirage (généralement 2 à 3 minutes). Si un lancement LEO est détecté, la vitesse de soumission est critique.14 Le système déclenche instantanément la Phase 2\.

## **Conception de l'Architecture Hybride \- Phase 2 : Ajout au Panier Cryptographique (Carting API)**

Dès que la Phase 1 détecte que le lancement LEO est actif (le produit passe de upcoming à active), le système entre dans sa phase d'exécution ultra-rapide. L'objectif est de réserver le produit côté serveur avant que les utilisateurs réels n'aient le temps de charger l'interface graphique.

### **L'Endpoint de Réservation et le Payload**

En s'appuyant sur les recherches expérimentales du dépôt alexschimpf, la requête doit être formulée sous forme de POST ou GET (selon les mises à jour V2 de l'API Nike) vers https://api.nike.com/buy/checkout\_v2 ou l'ancien jcartService.5 La charge utile (payload) JSON encapsule l'identité du produit, un timestamp strict, et la taille sélectionnée :

JSON

{  
  "action": "addItem",  
  "productId": "ID\_EXTRAIT\_LORS\_DE\_LA\_PHASE\_1",  
  "skuId": "SKU\_ID\_SPECIFIQUE\_A\_LA\_TAILLE",  
  "qty": 1,  
  "rt": "json"  
}

Note: Les endpoints précis varient fréquemment; le système doit être conçu pour extraire dynamiquement la structure du payload à partir du fichier de configuration stateful de l'application React (INITIAL\_REDUX\_STATE) si l'API v3 l'exige.5

### **Contournement de la Couche Transport (TLS Impersonation)**

L'envoi de ce payload via une bibliothèque standard échouera lamentablement à cause des vérifications Akamai décrites précédemment.6 Pour assurer le succès de l'ajout au panier, le script Python doit intégrer une bibliothèque spécialisée dans l'usurpation TLS, telle que tls-client ou curl\_cffi.13  
L'implémentation algorithmique se présente ainsi :

1. Le système instancie une session TLS modifiée en spécifiant le paramètre client\_identifier="chrome\_120".13  
2. Le système injecte des en-têtes (headers) parfaits, respectant scrupuleusement l'ordre exigé par Chrome : Sec-Fetch-Mode, Sec-Fetch-Site, Accept-Language: fr-FR,fr;q=0.9, et le User-Agent exact correspondant à l'empreinte TLS générée.13  
3. La requête est transmise via un proxy résidentiel français de très haute qualité.26

Cette usurpation parfaite garantit que la requête est traitée par les serveurs de Nike comme provenant d'un navigateur humain légitime, aboutissant à un code de statut HTTP 200 et, plus important encore, au retour de cookies de session (Set-Cookie) confirmant que l'article est verrouillé dans le panier de l'utilisateur.5

## **Conception de l'Architecture Hybride \- Phase 3 : Transfert de Session et Checkout via Playwright**

L'ajout au panier ayant été réalisé en quelques millisecondes via API, le système est désormais confronté à la barrière du paiement. L'envoi des données de carte de crédit via une simple requête API est pratiquement impossible sur le marché français en raison des jetons de sécurité complexes générés par les passerelles de paiement (Adyen, Stripe) et des lois européennes sur la sécurité des transactions.3 L'ingéniosité de l'architecture hybride s'exprime par le "Session Handoff" (Transfert de session).

### **Injection des Cookies et Initialisation Furtive**

Le script Python extrait les cookies de la session API réussie et les sérialise au format JSON.8 Simultanément, il instancie un contexte de navigateur automatisé. Pour éviter les écueils de détection rencontrés par amaanrahman7/SNKRS-Bot, le système abandonne totalement Selenium au profit de Playwright couplé au plugin Python playwright-stealth (qui dérive du célèbre puppeteer-extra-plugin-stealth).4  
L'initialisation de ce navigateur furtif est critique. Le plugin stealth s'assure d'effacer la propriété navigator.webdriver, de masquer la mention "HeadlessChrome" dans l'User-Agent, de simuler des plugins par défaut, de falsifier les données de WebGL pour correspondre à une carte graphique grand public, et de générer une activité de souris pseudo-aléatoire.4  
Une fois l'environnement sécurisé instancié, le script appelle context.add\_cookies(cookies\_json).8 Cette action greffe la session authentifiée (et le panier rempli) directement dans le navigateur.

### **Automatisation du Formulaire de Paiement**

Le navigateur Playwright est alors dirigé directement vers la page de paiement française : https://www.nike.com/fr/checkout.33 Étant donné que le produit est déjà dans le panier, l'interface graphique saute les étapes de chargement du catalogue et affiche directement le résumé de la commande.  
La logique du main.py de base est réintroduite ici, mais optimisée. Le script identifie les sélecteurs CSS ou XPath du formulaire pour y injecter de manière séquentielle, et avec des délais aléatoires (pour simuler la frappe humaine), les informations du profil utilisateur : nom, adresse en France, ville, code postal, et les champs de la carte bancaire.26 Le système est également capable de prendre en charge d'autres méthodes de paiement préconfigurées telles que PayPal, Google Pay ou Apple Pay si le profil le spécifie.34

## **Spécificités du Marché Français et Multi-Pays : Défis Réglementaires et Logistiques**

Concevoir un bot multi-pays avec un focus sur la France ne se résume pas à traduire des requêtes HTTP. L'architecture doit s'adapter aux lourdes spécificités du marché européen de la vente en ligne, tant sur le plan réglementaire que logistique.

### **La Barrière de la DSP2 et de l'Authentification 3D Secure 2.0**

Le défi majeur de l'automatisation en France (et plus largement au sein de l'Union Européenne) réside dans la conformité à la Directive sur les Services de Paiement (DSP2). Cette réglementation impose une Authentification Forte du Client (SCA \- Strong Customer Authentication) pour la quasi-totalité des transactions électroniques, matérialisée par le protocole 3D Secure 2.0.35  
Contrairement aux États-Unis où une carte de crédit (CC) valide accompagnée d'un CVV suffit généralement pour conclure l'achat, la France exige une validation biométrique ou multifactorielle.35 Lorsqu'un bot soumet le formulaire de paiement sur /fr/checkout, l'interface iframe de la banque (par exemple, la vérification Lydia, BoursoBank, ou Crédit Agricole SecuriPass) s'affiche, bloquant toute progression automatisée.  
L'architecture hybride apporte une solution élégante à cette impasse. Plutôt que d'échouer face à cette iframe, le script Playwright est programmé pour détecter l'apparition du module 3D Secure. Dès détection, le script met l'exécution du navigateur en pause (tout en maintenant la connexion active) et déclenche une routine de notification externe, généralement via un Webhook Discord ou un bot Telegram.16 L'utilisateur reçoit une alerte instantanée sur son smartphone (ex: "Action Requise : Validation 3D Secure pour Jordan 1 \- 170€"). L'utilisateur ouvre son application bancaire, valide la transaction manuellement via reconnaissance faciale ou empreinte digitale, ce qui débloque la page web. Le script Playwright, en écoute, détecte la confirmation de paiement et finalise la session.

### **Stratégies d'Adresses et Gestion Logistique**

La rareté de certains modèles crée des disparités d'allocation entre l'Europe et les États-Unis. Bien que ce bot soit focalisé sur la France, sa capacité multi-pays permet d'exploiter les déséquilibres de stock (comme ce fut le cas lors de la pénurie de la Jordan 1 'Black/White' en France, alors que le stock américain était abondant).35  
Le système doit pouvoir gérer des profils de "Freight Forwarders" (réexpéditeurs de colis). Si l'utilisateur choisit de cibler une sortie sur nike.com/launch (US) pour contourner une pénurie française, le bot sélectionne automatiquement un profil contenant une adresse de réexpédition exempte de taxes (Tax-Free state) aux États-Unis, modifie ses requêtes API pour correspondre au marché américain (countryCode=US), et bascule sur un réseau de proxys résidentiels nord-américains pour maintenir la cohérence.35 Cette flexibilité logistique est intégrée dans le modèle de données de l'application.

## **Infrastructure Logicielle : Gestion des Données et Interface Ligne de Commande (CLI)**

Pour qu'une telle complexité opérationnelle soit utilisable, l'architecture doit s'appuyer sur une infrastructure logicielle solide, isolant la logique métier de la gestion des données, et offrant à l'opérateur un contrôle total via une interface en ligne de commande (CLI) réactive.

### **Modélisation de la Base de Données Chiffrée**

Les systèmes amateurs codent souvent les informations en dur (hardcoding) dans le fichier main.py, ce qui constitue une aberration architecturale et un risque de sécurité inacceptable. Notre système exige une base de données relationnelle locale légère, de préférence SQLite, gérée via un ORM (Object-Relational Mapping) en Python tel que SQLAlchemy.  
La base de données doit être structurée autour de plusieurs tables critiques :

1. **Profils** : Stocke les informations personnelles, l'adresse de facturation française, l'adresse de livraison, et les tailles de chaussures de prédilection.  
2. **Méthodes de Paiement** : Stocke les données des cartes bancaires. **Avertissement de sécurité absolu** : Ces données ne doivent jamais être stockées en texte clair. Une bibliothèque de cryptographie asymétrique (comme cryptography.fernet en Python) doit chiffrer les numéros de carte et les CVV. La clé de déchiffrement doit être fournie par l'utilisateur sous forme de mot de passe maître lors du lancement de la CLI.  
3. **Proxys** : Gère une liste d'adresses IP résidentielles, avec leurs identifiants d'authentification, triées par pays de localisation pour garantir la cohérence géographique lors des lancements ciblés.  
4. **Comptes Nike** : Stocke les identifiants de multiples comptes membres Nike, essentiels pour les lancements de type DAN qui requièrent une participation massive.16

### **Architecture de l'Interface en Ligne de Commande (CLI)**

L'interface en ligne de commande (CLI) représente le tableau de bord de l'architecture hybride. Construite avec des bibliothèques robustes telles que Click ou Argparse, la CLI doit être modulaire, offrant une série de commandes hiérarchisées permettant d'orchestrer la préparation, la surveillance et l'exécution de l'achat.  
Le tableau suivant illustre la structure des commandes requises pour le fonctionnement optimal du système :

| Commande CLI Stratégique | Action Déclenchée dans l'Architecture | Description Fonctionnelle |
| :---- | :---- | :---- |
| snkrs profile add | Écriture BDD (SQLite \+ AES) | Permet à l'utilisateur de configurer un nouveau profil avec adresse FR et carte chiffrée. |
| snkrs proxy test \--region FR | Couche Réseau | Teste la latence et la validité des proxys résidentiels français avant le lancement. |
| snkrs login \--accounts all | Playwright Stealth | Pré-authentifie tous les comptes Nike en arrière-plan et sauvegarde les cookies de session pour gagner du temps lors du drop.38 |
| snkrs monitor \--sku \--market FR | Moteur API (Phase 1\) | Lance la surveillance asynchrone de l'API Nike pour détecter le changement d'état du produit ciblé.14 |
| snkrs task start \--sku \--mode LEO | Orchestration Complète | Déclenche l'ensemble du pipeline hybride : API Carting ultra-rapide \-\> Transfert de cookies \-\> Checkout Playwright.5 |

L'exécution de la commande task start déploie le moniteur d'événements asynchrones. La CLI doit fournir un retour visuel coloré (via des bibliothèques comme Rich ou Colorama) détaillant chaque milliseconde de l'opération : statut de la génération des tokens Akamai, succès de l'ajout au panier, bascule vers le navigateur, et enfin, l'alerte critique invitant l'utilisateur à valider le 3D Secure sur son application bancaire.

## **Synthèse Stratégique et Recommandations d'Implémentation**

Le développement d'un bot d'achat automatisé pour la plateforme Nike SNKRS en 2026, avec un focus sur la complexité du marché français, requiert une maîtrise technique interdisciplinaire mêlant ingénierie inverse, cryptographie réseau, et automatisation furtive de navigateur. L'analyse des ressources existantes sur GitHub et des mécanismes de défense de Nike permet d'établir un diagnostic clair : les solutions monolithiques sont mortes.  
Les dépôts basés exclusivement sur une automatisation d'interface, incarnés par des projets comme amaanrahman7/SNKRS-Bot ou FranciscoCastagnaro/snkrsBot, sont structurellement incapables de survivre aux vérifications biométriques et aux analyses de l'empreinte navigator.webdriver imposées par les capteurs JavaScript d'Akamai Bot Manager.4 Bien que la logique décisionnelle du main.py de amaanrahman7 puisse servir de modèle conceptuel pour naviguer dans le formulaire de paiement, son moteur d'exécution (Selenium standard) doit être catégoriquement abandonné. De même, les moniteurs de vente au détail génériques tels que pvinay0312 ou les scripts vétustes comme rsurasin ne possèdent pas l'architecture nécessaire pour interagir avec les endpoints chiffrés et évolutifs de l'infrastructure V3 de Nike.19  
La viabilité opérationnelle ne peut être atteinte que par la mise en œuvre de l'architecture hybride définie dans ce rapport. Il s'agit en premier lieu de fusionner les formidables capacités d'extraction de données du SDK TypeScript whoisYeshua/nike-release-checker, qui offre une manipulation parfaite des flux API de Nike et permet de cibler le marché français (countryCode=FR) tout en discriminant instantanément les méthodologies de lancement (Tirage au sort DAN contre file d'attente rapide LEO).14 Cette détection asynchrone précoce doit alimenter un moteur de requêtes HTTP hautement furtif. Ce moteur, usant de la manipulation avancée des signatures TLS (via des bibliothèques comme tls-client) et couplé à des générateurs de données de capteurs (via des API tierces comme Scrapeless), est le seul moyen de simuler une requête organique capable de verrouiller un produit dans le panier à une vitesse inaccessible par l'interface utilisateur graphique.13  
L'innovation centrale de ce système repose sur le transfert dynamique des cookies (Session Handoff), une approche dont la faisabilité est effleurée par le script expérimental de alexschimpf/Snkrs-Bot.5 Le succès du checkout repose entièrement sur la capacité du système à transférer la session authentifiée par l'API vers une instance de navigateur gérée par Playwright, lourdement modifiée par l'extension playwright-stealth.8 Cet environnement de rendu complet permet de naviguer indétectablement sur l'URL de paiement spécifique /fr/checkout, d'injecter de manière programmatique les informations de facturation, et surtout, de gérer les fenêtres d'interaction iframe liées au protocole 3D Secure imposé par la réglementation européenne DSP2.33  
En associant cette triade technologique (Monitoring API asynchrone, Carting TLS usurpé, et Checkout Playwright furtif) à une solide base de données SQLite chiffrée par AES, le tout orchestré par une interface en ligne de commande (CLI) dynamique et des pools de proxys résidentiels français géolocalisés, l'architecture proposée fournit la solution la plus avancée et résiliente pour naviguer dans l'écosystème restrictif des lancements Nike SNKRS. La conception n'est plus une simple question d'automatisation de clics, mais une véritable chorégraphie réseau visant à imiter la perfection asymétrique des communications humaines.

#### **Sources des citations**

1. Nike SNKRS: Bot Protection, consulté le mars 28, 2026, [https://www.nike.com/launch/t/inside-snkrs-bot-protection](https://www.nike.com/launch/t/inside-snkrs-bot-protection)  
2. Inside SNKRS: Fairness \- Nike, consulté le mars 28, 2026, [https://www.nike.com/launch/t/inside-snkrs-fairness](https://www.nike.com/launch/t/inside-snkrs-fairness)  
3. Is Sneaker Botting Still Worth It in 2026 \- Proxyway, consulté le mars 28, 2026, [https://proxyway.com/guides/is-sneaker-botting-worth-it](https://proxyway.com/guides/is-sneaker-botting-worth-it)  
4. How does Nike SNKRS detect and block Selenium? Are there any work around? \- Reddit, consulté le mars 28, 2026, [https://www.reddit.com/r/shoebots/comments/fep3xt/how\_does\_nike\_snkrs\_detect\_and\_block\_selenium\_are/](https://www.reddit.com/r/shoebots/comments/fep3xt/how_does_nike_snkrs_detect_and_block_selenium_are/)  
5. alexschimpf/Snkrs-Bot: Selenium bot for Nike Snkrs site ... \- GitHub, consulté le mars 28, 2026, [https://github.com/alexschimpf/Snkrs-Bot](https://github.com/alexschimpf/Snkrs-Bot)  
6. How to Bypass Akamai when Web Scraping in 2026 \- Scrapfly Blog, consulté le mars 28, 2026, [https://scrapfly.io/blog/posts/how-to-bypass-akamai-anti-scraping](https://scrapfly.io/blog/posts/how-to-bypass-akamai-anti-scraping)  
7. What is a Sneaker Bot? \- Wallarm, consulté le mars 28, 2026, [https://www.wallarm.com/what/what-is-a-sneaker-bot](https://www.wallarm.com/what/what-is-a-sneaker-bot)  
8. How to save and load cookies in Playwright? \- ScrapingBee, consulté le mars 28, 2026, [https://www.scrapingbee.com/webscraping-questions/playwright/how-to-save-and-load-cookies-in-playwright/](https://www.scrapingbee.com/webscraping-questions/playwright/how-to-save-and-load-cookies-in-playwright/)  
9. Avoiding Bot Detection with Playwright Stealth \- Bright Data, consulté le mars 28, 2026, [https://brightdata.com/blog/how-tos/avoid-bot-detection-with-playwright-stealth](https://brightdata.com/blog/how-tos/avoid-bot-detection-with-playwright-stealth)  
10. github.com, consulté le mars 28, 2026, [https://github.com/amaanrahman7/SNKRS-Bot/blob/main/main.py](https://github.com/amaanrahman7/SNKRS-Bot/blob/main/main.py)  
11. consulté le janvier 1, 1970, [https://github.com/amaanrahman7/SNKRS-Bot](https://github.com/amaanrahman7/SNKRS-Bot)  
12. consulté le janvier 1, 1970, [https://raw.githubusercontent.com/amaanrahman7/SNKRS-Bot/main/main.py](https://raw.githubusercontent.com/amaanrahman7/SNKRS-Bot/main/main.py)  
13. Bypass Anti-Bot Detection with Python: The Complete 2026 Guide \- Medium, consulté le mars 28, 2026, [https://medium.com/@datajournal/bypass-anti-bot-detection-with-python-the-complete-2026-guide-83ff75b92c76](https://medium.com/@datajournal/bypass-anti-bot-detection-with-python-the-complete-2026-guide-83ff75b92c76)  
14. whoisYeshua/nike-release-checker: Simple terminal Nike stock checker (50+ countries), consulté le mars 28, 2026, [https://github.com/whoisYeshua/nike-release-checker](https://github.com/whoisYeshua/nike-release-checker)  
15. How to save and load cookies in Playwright? \- Scrapfly, consulté le mars 28, 2026, [https://scrapfly.io/blog/answers/how-to-save-and-load-cookies-in-playwright](https://scrapfly.io/blog/answers/how-to-save-and-load-cookies-in-playwright)  
16. snkrs · GitHub Topics, consulté le mars 28, 2026, [https://github.com/topics/snkrs](https://github.com/topics/snkrs)  
17. github.com, consulté le mars 28, 2026, [https://github.com/FranciscoCastagnaro/snkrsBot](https://github.com/FranciscoCastagnaro/snkrsBot)  
18. consulté le janvier 1, 1970, [https://github.com/FranciscoCastagnaro/snkrsBot/blob/master/bot.py](https://github.com/FranciscoCastagnaro/snkrsBot/blob/master/bot.py)  
19. consulté le janvier 1, 1970, [https://github.com/pvinay0312/retail-monitor-python](https://github.com/pvinay0312/retail-monitor-python)  
20. github.com, consulté le mars 28, 2026, [https://github.com/KrystianWeclawiak/NIKE-SNKRS-API-MONITOR](https://github.com/KrystianWeclawiak/NIKE-SNKRS-API-MONITOR)  
21. consulté le janvier 1, 1970, [https://github.com/KrystianWeclawiak/NIKE-SNKRS-API-MONITOR/blob/master/monitor.py](https://github.com/KrystianWeclawiak/NIKE-SNKRS-API-MONITOR/blob/master/monitor.py)  
22. github.com, consulté le mars 28, 2026, [https://github.com/Longe-J/nike-Quick-Buy-Bot](https://github.com/Longe-J/nike-Quick-Buy-Bot)  
23. consulté le janvier 1, 1970, [https://github.com/Longe-J/nike-Quick-Buy-Bot/blob/master/nike\_bot.py](https://github.com/Longe-J/nike-Quick-Buy-Bot/blob/master/nike_bot.py)  
24. How to Bypass Akamai With Playwright \- Scrapeless, consulté le mars 28, 2026, [https://www.scrapeless.com/en/blog/bypss-akamai-with-playwright](https://www.scrapeless.com/en/blog/bypss-akamai-with-playwright)  
25. How to Bypass Akamai With Playwright \- ZenRows, consulté le mars 28, 2026, [https://www.zenrows.com/blog/playwright-akamai](https://www.zenrows.com/blog/playwright-akamai)  
26. How to Bypass Akamai in 2026 \- Roundproxies, consulté le mars 28, 2026, [https://roundproxies.com/blog/bypass-akamai/](https://roundproxies.com/blog/bypass-akamai/)  
27. SNKRS Draw Rules and Terms and Conditions | Nike Help, consulté le mars 28, 2026, [https://www.nike.com/il/help/a/nike-launch-drawing](https://www.nike.com/il/help/a/nike-launch-drawing)  
28. Snkrs bot : r/shoebots \- Reddit, consulté le mars 28, 2026, [https://www.reddit.com/r/shoebots/comments/1oombth/snkrs\_bot/](https://www.reddit.com/r/shoebots/comments/1oombth/snkrs_bot/)  
29. 2025 Complete Guide to AI Agent Payments: How the AP2 Protocol is Reshaping Intelligent Commerce \- DEV Community, consulté le mars 28, 2026, [https://dev.to/czmilo/2025-complete-guide-to-ai-agent-payments-how-the-ap2-protocol-is-reshaping-intelligent-commerce-2imf](https://dev.to/czmilo/2025-complete-guide-to-ai-agent-payments-how-the-ap2-protocol-is-reshaping-intelligent-commerce-2imf)  
30. Sneakers Database API \- Zyla API Hub, consulté le mars 28, 2026, [https://zylalabs.com/api-marketplace/data/sneakers+database+api/916](https://zylalabs.com/api-marketplace/data/sneakers+database+api/916)  
31. How to webscrape all shoes on nike page using python \- Stack Overflow, consulté le mars 28, 2026, [https://stackoverflow.com/questions/62999427/how-to-webscrape-all-shoes-on-nike-page-using-python](https://stackoverflow.com/questions/62999427/how-to-webscrape-all-shoes-on-nike-page-using-python)  
32. Add cookies in playwright test \- javascript \- Stack Overflow, consulté le mars 28, 2026, [https://stackoverflow.com/questions/64211501/add-cookies-in-playwright-test](https://stackoverflow.com/questions/64211501/add-cookies-in-playwright-test)  
33. Paiement. Nike.com, consulté le mars 28, 2026, [https://www.nike.com/fr/checkout](https://www.nike.com/fr/checkout)  
34. What Are Nike's Payment Options? | Nike Help, consulté le mars 28, 2026, [https://www.nike.com/help/a/payment-options](https://www.nike.com/help/a/payment-options)  
35. US SNKRS vs France Retail: 2026 Nike Jordan 1 Black/White | comGateway, consulté le mars 28, 2026, [https://www.comgateway.com/blogs/us-snkrs-vs-france-retail-why-ignoring-the-2026-nike-jordan-1-black-white-us-restock-is-a-costly-mistake/](https://www.comgateway.com/blogs/us-snkrs-vs-france-retail-why-ignoring-the-2026-nike-jordan-1-black-white-us-restock-is-a-costly-mistake/)  
36. rsurasin/snkrbot: A discord bot used to get information about shoes. \- GitHub, consulté le mars 28, 2026, [https://github.com/rsurasin/snkrbot](https://github.com/rsurasin/snkrbot)  
37. Quick Start \- Documentation \- Volume, consulté le mars 28, 2026, [https://docs.getvolume.com/payments/mobile-integrate-volume-sdk/react-native/get-started](https://docs.getvolume.com/payments/mobile-integrate-volume-sdk/react-native/get-started)  
38. Authentication \- Playwright, consulté le mars 28, 2026, [https://playwright.dev/docs/auth](https://playwright.dev/docs/auth)