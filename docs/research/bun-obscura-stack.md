# Stack Bun + Obscura — vérification des fondations

Date de vérification : 25 août 2026. Ce document ne couvre que la cible décidée : macOS Apple Silicon, MCP `stdio`, ressources publiques, sans Docker ni service distant au moment de la recherche. Les appels au front Google et aux sites restent évidemment réseau ; « sans API externe » ne doit pas être confondu avec « hors-ligne ».

## Décision courte

Utiliser **Bun + TypeScript 7 + `bun:sqlite` + le SDK MCP TypeScript** est réaliste et léger. Obscura doit rester le navigateur de rendu et le serveur CDP natif installé séparément ; **ne pas remplacer Obscura par `Bun.WebView`** dans le produit, même si Bun propose désormais cette API.

Le client CDP v1 doit être un petit adaptateur interne fondé sur le `WebSocket` natif de Bun, qui ne met en œuvre que les messages CDP nécessaires. Ne pas embarquer Puppeteer/Playwright juste pour cette connexion. Obscura annonce une compatibilité avec eux, donc ils restent des solutions de secours uniquement si le benchmark démontre une lacune du client minimal.

Avant toute implémentation spécifique, essayer dans cet ordre : capacités natives d’Obscura, API natives Bun, bibliothèques maintenues et testées sous Bun, puis seulement code local très borné.

## Statut des API Bun

| Besoin | API | Statut vérifié | Décision |
|---|---|---|---|
| MCP stdio | SDK MCP TypeScript + Bun | support Bun déclaré par le SDK | Oui ; importer le transport stdio du SDK. Cela s’appuie potentiellement sur les *compatibility shims* `node:` de Bun, mais **n’exécute pas Node.js**. |
| Rendu Web | Obscura natif/CDP | stable côté contrat de projet Obscura, à versionner/pinner | Oui, moteur principal. |
| WebView local Bun | `Bun.WebView` | **expérimental**, API susceptible de changer | Non pour le pipeline principal ; utile uniquement pour expérimentation/outil de diagnostic macOS. |
| SQL, FTS, transactions | `bun:sqlite` | natif et stable dans Bun | Oui. |
| Sous-processus | `Bun.spawn` | API Bun documentée | Oui, pour `obscura serve` et son arrêt contrôlé. |
| téléchargement/fichiers | `fetch`, `Bun.write`, `Bun.file`, `FileSink` | API Bun documentée | Oui. |
| CDP WebSocket | `WebSocket` global | API Bun documentée | Oui. |
| Markdown entrant | `Bun.markdown` | **unstable** | Non comme dépendance critique ; l’utiliser seulement éventuellement pour inspection/normalisation en mode opt-in. |

### `Bun.WebView` : réel, mais pas interchangeable avec Obscura

`Bun.WebView` existe et est présenté par Bun comme un navigateur headless pour automatiser, évaluer du JavaScript, cliquer et capturer des images. Sur macOS, son backend par défaut est **WKWebView/WebKit** et ne requiert aucune installation. Le backend Chrome exige au contraire Chrome/Chromium/Edge/Brave installé. Bun précise explicitement que l’API est expérimentale. Les vues différentes rendent en parallèle, mais une même vue n’accepte qu’une opération de chaque catégorie à la fois ; une opération concurrente du même type échoue, elle n’est pas mise en file.

Conséquences : WebKit ne reproduit pas Chrome/Google exactement et ne fournit pas l’empreinte/les capacités spécialisées d’Obscura. Garder Obscura pour la recherche ; ne pas construire une seconde abstraction navigateur. `Bun.WebView` pourrait être un fallback manuel, jamais un fallback automatique qui rendrait les résultats non comparables.

Sources : [Bun WebView](https://bun.com/docs/runtime/webview), [référence WebView](https://bun.com/reference/bun/WebView).

### SQLite local

`bun:sqlite` est le bon stockage v1. Bun documente une API synchrone préparée/cachée ; **Bun ne garantit pas explicitement FTS5**, et sur macOS il utilise SQLite système. Vérifier donc FTS5 au démarrage avec `SELECT sqlite_compileoption_used('ENABLE_FTS5')` et la création d’une table temporaire `USING fts5`; échouer avec un diagnostic clair si absent. Un SQLite Homebrew peut être sélectionné avec `Database.setCustomSQLite(path)` *avant toute ouverture* si cette capacité manque. Les transactions sont les transactions SQLite ordinaires (`BEGIN IMMEDIATE`/`COMMIT` ou le helper transaction de l’API), et les valeurs binaires se lient sous forme de `Uint8Array`/BLOB. Pour ce projet, ne placer que les petits artefacts, hashes et extraits dans SQLite ; les documents bruts/rendus restent des fichiers adressés par SHA-256.

Activer `PRAGMA journal_mode=WAL` au démarrage. Bun recommande WAL pour les lecteurs concurrents et un rédacteur. Attention : sur macOS Bun utilise SQLite système, configuré avec `PERSIST_WAL`; les fichiers `-wal` et `-shm` persistent après fermeture. C’est attendu. Si le nettoyage est exigé, désactiver ce flag via `fileControl` puis exécuter `PRAGMA wal_checkpoint(TRUNCATE)` pendant l’arrêt propre ; ne pas supprimer ces fichiers à la main.

Sources : [Bun SQLite](https://bun.com/docs/runtime/sqlite), [référence `bun:sqlite`](https://bun.com/reference/bun/sqlite), [SQLite FTS5](https://www.sqlite.org/fts5.html).

### Processus Obscura et arrêt

`Bun.spawn` retourne des flux Web, `exited`, `exitCode`, `signalCode`, `onExit` et `kill()`. Il prend un `AbortSignal`, `timeout`, `maxBuffer` et le signal à employer en cas d’expiration. Le MCP doit posséder exactement un processus `obscura serve` (127.0.0.1), attendre sa disponibilité CDP, puis le terminer au `SIGTERM`/`SIGINT` du MCP avec délai limité avant `SIGKILL`. Capturer stderr dans un buffer borné et persister le dernier diagnostic ; ne jamais laisser une nouvelle instance être lancée par requête.

Une instance déjà lancée explicitement par l’utilisateur doit pouvoir être utilisée via `OBSCURA_CDP_URL`; dans ce cas elle n’est pas arrêtée par le MCP. Sur macOS, les signaux POSIX sont disponibles : c’est notre unique plateforme v1.

Sources : [Bun child processes](https://bun.com/docs/runtime/child-process), [référence `Bun.spawn`](https://bun.com/reference/bun/spawn).

### Téléchargement plafonné à 25 Mo et stockage

`Bun.write(destination, Response)` sait écrire un `Response` vers un fichier, et `Bun.file(...).writer()` fournit un `FileSink` incrémental. Pour être strict sur 25 Mo, ne pas appeler aveuglément `Bun.write` :

1. refuser immédiatement un `Content-Length` supérieur à 25 MiB ;
2. sinon lire `response.body` par chunks, compter les octets, écrire dans un fichier temporaire avec `FileSink` ;
3. interrompre/annuler le reader dès le plafond ;
4. hasher à mesure, fermer, puis renommer atomiquement le fichier validé sous son SHA-256.

Cette vérification reste nécessaire car `Content-Length` peut manquer ou mentir. Aucun PDF/vidéo ne doit être tenu en mémoire entière. Utiliser `AbortController` pour les délais de connexion/lecture et conserver `Content-Type`, longueur, ETag, Last-Modified et URL finale.

Sources : [Bun File I/O](https://bun.com/docs/runtime/file-io), [API Web Bun (`fetch`, streams, AbortController)](https://bun.com/docs/runtime/web-apis).

### CDP

Bun implémente le client `WebSocket` standard pour `ws:`/`wss:` et une extension de headers personnalisés. C’est suffisant pour CDP : connexion au WebSocket de la cible, compteur d’`id`, table `id → Promise`, puis écoute des événements. Le MCP n’a besoin initialement que de créer/fermer une target, naviguer, attendre un état, évaluer du JavaScript et récupérer DOM/screenshot si nécessaire.

Obscura annonce un serveur CDP et une compatibilité Playwright (`connectOverCDP`) et Puppeteer (`browserWSEndpoint`). Une bibliothèque lourde ne se justifie donc pas pour v1. Tester ce client sur le corpus de benchmark et ne rajouter `puppeteer-core` ou `playwright-core` qu’en cas de fonction CDP réellement manquante. Ni l’un ni l’autre n’est une dépendance Bun officielle ; leur compatibilité Bun/Obscura doit être démontrée par un test d’intégration versionné, pas supposée.

Sources : [Bun WebSocket client](https://bun.com/docs/runtime/http/websockets), [Obscura — compatibilité Puppeteer/Playwright](https://github.com/h4ckf0r0day/obscura#puppeteer--playwright).

### HTML et Markdown intégrés à Bun

Bun dispose de `HTMLRewriter`, mais c’est une API de **transformation streaming** de réponses HTML, non un DOM navigateur et non un extracteur d’article. Il ne remplace ni `document` ni Readability. Bun ne fournit pas de parser HTML DOM universel documenté pour donner du HTML arbitraire à Readability.

`Bun.markdown` est un parseur Markdown Zig, GFM et callbacks structurés (dont les code fences), mais Bun le qualifie d’**unstable**. Il est utile pour manipuler un Markdown déjà obtenu d’Obscura, sans être le socle de l’extraction HTML.

Sources : [HTML/static Bun et HTMLRewriter](https://bun.com/docs/bundler/html-static), [Bun Markdown](https://bun.com/docs/runtime/markdown).

## Extraction, sanitization et formats : réutiliser avant de créer

### HTML rendu

1. **Premier choix : capacités d’extraction/Markdown d’Obscura** si elles passent notre corpus. Elles partent du DOM rendu et évitent une seconde implémentation DOM.
2. **Article : `@mozilla/readability`**. C’est la bibliothèque extraite de Firefox Reader View. Elle attend un vrai `Document`, modifie le document reçu et recommande de travailler sur un clone. Elle ne sanitise pas elle-même ; son README recommande explicitement DOMPurify pour toute sortie HTML non fiable.
3. Si l’extraction nécessite un DOM hors navigateur : adopter **Cheerio** pour parsing/normalisation structurelle, pas jsdom par défaut. Cheerio documente l’installation `bun add cheerio`, repose sur parse5 et peut employer htmlparser2. Il n’est pas une implémentation du DOM navigateur complète, donc il faut d’abord faire un test Readability réel sur le DOM fourni/injecté par Obscura. Si Obscura n’expose pas de `Document` transférable, décider sur benchmark entre le coût de jsdom et une extraction Obscura native ; ne pas inventer un pseudo-DOM.
4. **HTML vers Markdown : Turndown** seulement si Obscura ne fournit pas un Markdown satisfaisant. Turndown accepte une chaîne HTML ou un nœud DOM et propose les blocs fenced, mais l’échappement est volontairement agressif. Ajouter son plugin GFM si les tables GitHub sont requises. Garder les blocs `pre > code` dans une voie structurée distincte pour préserver langage et contenu.

Sources : [Readability](https://github.com/mozilla/readability#readme), [Cheerio](https://github.com/cheeriojs/cheerio#readme), [Turndown](https://github.com/mixmark-io/turndown#readme).

### Sanitization et prompt injection

La sanitization sert à ce que le MCP ne livre **jamais du HTML actif** : supprimer scripts, styles, formulaires, iframes, event handlers, URLs dangereuses et contenu masqué avant stockage/retour. Elle ne peut pas reconnaître de manière fiable une instruction malveillante visible dans du texte ; chaque passage reste `external_untrusted`, avec URL, date et hash.

Pour un HTML à afficher, DOMPurify est le choix connu par Readability, mais demande un DOM serveur correct. Le projet DOMPurify rappelle que le DOM serveur fait partie du TCB et que ses différences peuvent créer des bypass. À ce stade, le MCP ne doit **pas** renvoyer d’HTML : retourner texte/Markdown sanitizé et blocs de code structurés minimise cette surface. Ne pas adopter `sanitize-html` : son dépôt historique a été archivé en février 2026.

Les blocs de code ne sont jamais exécutés ni soumis à un filtre de langage naturel ; les annoter `{kind: "code", language?, trust: "external_untrusted"}`, signaler les caractères invisibles, et préserver les contenus GitHub/docs.

Sources : [sécurité Readability](https://github.com/mozilla/readability#security), [DOMPurify — DOM serveur dans le TCB](https://github.com/cure53/DOMPurify/wiki/Attack-Classes-%26-Bypass-History#20-server-side-doms-jsdom-is-part-of-the-tcb), [statut archivé de sanitize-html](https://github.com/apostrophecms/sanitize-html).

### PDF, robots et autres formats

- **PDF textuel** : commencer par `pdfjs-dist`/PDF.js, maintenu par Mozilla, et valider son exécution Bun avec un test d’intégration isolé. PDF.js documente Node.js 22+ comme « mostly » supporté et tests limités ; il ne déclare pas officiellement Bun. Donc c’est un extracteur **optionnel/expérimental**, pas une promesse v1. Détecter rapidement une absence de texte et retourner `unsupported_or_ocr_required`, sans OCR automatique.
- **robots.txt** : ne pas écrire le parser. `robots-txt-parser` fournit user-agent, wildcards, cache et promesses ; évaluer sa compatibilité Bun dans un test d’intégration. Il est Node-oriented et ne proclame pas Bun : alternative à ne retenir que si le test passe. La politique applicative décidée reste : vérifier robots pour les URLs ouvertes automatiquement depuis `web_search`; `web_open` explicite peut continuer, avec trace de la décision.
- **Markdown, texte, JSON/XML** : utiliser directement les flux Bun ; ne convertir qu’après identification MIME/sniffing borné.

Sources : [PDF.js README](https://github.com/mozilla/pdf.js#readme), [FAQ PDF.js — support environnement](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions), [robots-txt-parser](https://github.com/chrisakroyd/robots-txt-parser#readme).

## TypeScript 7 et MCP sous Bun

Au 25 août 2026, TypeScript **7.0 est une release stable** (annonce Microsoft du 8 juillet 2026), native/Go et annoncée comme souvent ~10× plus rapide que TypeScript 6. Ce n’est pas une raison de faire entrer un runtime Go dans le produit : Bun exécute le TypeScript directement ; TS 7 sert à typechecker/linter l’outil de développement/CI. Le dépôt `typescript-go` indique encore certaines zones sans parité totale : épingler une version TS 7 précise et laisser le typecheck dans la CI avant de basculer les éditeurs/outils.

Le SDK MCP TypeScript déclare fonctionner sous Node.js, Bun et Deno. Le tutoriel mentionne que ses exemples Node peuvent être exécutés avec `bun`; nous choisissons le transport stdio, pas SSE/HTTP. C’est la seule dépendance TypeScript obligatoire en plus du schéma de validation éventuellement requis par sa version. « Jamais Node » signifie ici : `bun run`, `bun install`, pas de processus Node ni de Docker. Cela n’interdit pas les imports compatibles `node:` qu’un package du SDK utiliserait et que Bun fournit.

Sources : [annonce TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7/), [état TypeScript Go](https://github.com/microsoft/typescript-go#readme), [SDK MCP TypeScript — démarrage](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md), [SDK MCP — support des runtimes](https://github.com/modelcontextprotocol/typescript-sdk#readme).

## Addendum : Bun 1.4.0, WebView/CDP et Obscura

### Faits exacts à épingler

Bun 1.4.0 a été annoncé le 20 août 2026. Dans cette version, `Bun.WebView` reste **expérimental** : il est donc disponible, mais son contrat peut changer dans une version mineure. Sur macOS, le backend par défaut est le `WKWebView` système. Le mode `backend: "chrome"` utilise CDP et requiert un navigateur Chrome-family disponible ; ce n’est pas Obscura ni un moteur WebKit rendu plus discret.

Le backend Chrome démarre un Chrome headless (via `--remote-debugging-pipe`) ou se connecte à un endpoint WebSocket DevTools déjà vivant. Le processus Bun ne crée qu’un navigateur par processus puis chaque `new Bun.WebView()` demande un nouvel onglet via `Target.createTarget`. Une WebView a les méthodes haut niveau (`navigate`, `evaluate`, `click`, `type`, `press`, `screenshot`) et, **uniquement avec le backend Chrome**, `cdp(method, params?)` ainsi que des événements CDP. Il faut avoir terminé au moins une navigation avant le premier appel `cdp`, sinon Bun lève `ERR_INVALID_STATE`; les commandes sont scopées à la session de l’onglet, et non à tout le navigateur.

Sources : [annonce Bun v1.4.0](https://github.com/oven-sh/bun/discussions/39751), [documentation/source Bun WebView](https://github.com/oven-sh/bun/blob/main/docs/runtime/webview.mdx), [référence `cdp`](https://bun.com/docs/runtime/webview#sending-commands).

### Peut-il piloter Obscura ?

**Hypothèse techniquement plausible, pas compatibilité officiellement déclarée par Bun** : Bun accepte une URL `ws://` d’un endpoint DevTools externe en `backend: { type: "chrome", url: "ws://…" }`. Obscura déclare exposer un serveur CDP et se connecter avec Playwright/Puppeteer. Si son endpoint est bien un **WebSocket CDP browser-level** avec les domaines `Target` et `Page` nécessaires, Bun.WebView devrait pouvoir s’y connecter et créer un onglet.

Ce n’est toutefois pas une intégration garantie : Bun documente l’endpoint comme celui d’un « existing Chrome », et Obscura ne documente que Playwright/Puppeteer, pas Bun.WebView. Il faut donc la classer `experimental`, derrière une sonde de compatibilité, sans jamais en faire le chemin de production au départ.

Les blocages réels sont les suivants :

- `url` doit être le WebSocket DevTools complet, pas seulement `http://127.0.0.1:9222`; l’URL explicite n’a **aucun** fallback si la connexion échoue.
- `url` ne peut pas être combiné avec `path` ou `argv`.
- si on omet `url: false`/URL explicite, Bun peut auto-détecter et joindre un navigateur utilisateur en remote-debugging : inacceptable pour la confidentialité. Un test avec Chrome doit toujours avoir `url: false` ou une URL Obscura explicite.
- `Bun.WebView.closeAll()` envoie `SIGKILL` aux sous-processus navigateur lancés par Bun. Il ne faut pas l’appeler pour une instance Obscura externe possédée par notre superviseur.
- Obscura peut avoir des écarts de compatibilité CDP ou d’implémentation de certains domaines; seule une sonde d’intégration épinglée peut les révéler.

Sources : [Bun WebView — connexion à un Chrome existant](https://github.com/oven-sh/bun/blob/main/docs/runtime/webview.mdx#connecting-to-an-already-running-chrome), [Obscura — CDP/Playwright/Puppeteer](https://github.com/h4ckf0r0day/obscura#puppeteer--playwright).

### Spike minimal, isolé et non bloquant

Ce spike ne modifie pas le MCP ni son architecture. Dans un répertoire temporaire et seulement avec un Obscura déjà installé :

1. lancer `obscura serve` sur loopback et lire son endpoint CDP réellement publié;
2. créer une seule `Bun.WebView` avec `backend: { type: "chrome", url: endpoint }`, sans profil Google ni cookies;
3. `navigate` vers une fixture publique déterministe, vérifier titre et `evaluate("document.body.innerText")`;
4. après la navigation, envoyer `cdp("DOM.getDocument")` et observer un événement CDP banal;
5. fermer la vue, arrêter seulement le processus Obscura démarré par le test; vérifier qu’aucun Chrome utilisateur n’a été touché.

Le spike est accepté seulement si les cinq étapes fonctionnent sur Bun **1.4.0** et la version Obscura épinglée, avec logs archivés. Sinon, garder l’adaptateur CDP WebSocket Bun décrit plus haut : c’est plus petit, ne suppose aucune émulation de Chrome par Bun et s’aligne directement sur le contrat Obscura. Même si le spike passe, la recommandation ne change pas : ne pas faire dépendre le produit de `Bun.WebView` expérimental tant que ce chemin n’apporte pas une capacité mesurée manquante au client CDP minimal.

## Outillage Bun-native : Oxlint + Oxfmt

### Installation et exécution

Les deux outils peuvent être installés et exécutés uniquement par Bun :

```sh
bun add -D oxlint oxfmt
bun add -D oxlint-tsgolint # seulement pour lint type-aware
bun run lint
bun run fmt:check
```

Scripts recommandés : `"lint": "oxlint --deny-warnings --report-unused-disable-directives"`, `"lint:types": "oxlint --type-aware --type-check --deny-warnings --report-unused-disable-directives"`, `"fmt": "oxfmt"`, `"fmt:check": "oxfmt --check"`. `--deny-warnings` rend les warnings non nuls en CI; `--report-unused-disable-directives` interdit les suppressions mortes. Des règles réellement strictes se fixent dans la configuration plutôt que de cacher des options dans les scripts.

Sources : [quickstart Oxlint](https://oxc.rs/docs/guide/usage/linter/quickstart.html), [CLI Oxlint](https://oxc.rs/docs/guide/usage/linter/cli), [quickstart Oxfmt](https://oxc.rs/docs/guide/usage/formatter/quickstart.html), [CLI Oxfmt](https://oxc.rs/docs/guide/usage/formatter/cli.html).

### Configuration sans Node : JSON/JSONC obligatoire

Le besoin utilisateur « jamais Node » exclut les configurations JavaScript/TypeScript dynamiques. La CLI Oxlint indique explicitement que ces configs requièrent Node.js; sa documentation de configuration précise Node 22.18+ ou 24+ pour `oxlint.config.ts`. Utiliser donc exclusivement `.oxlintrc.json`/`.oxlintrc.jsonc` et `.oxfmtrc.json`/`.oxfmtrc.jsonc`, les fournir explicitement dans les scripts si nécessaire, et les versionner. Cette décision reste Bun-native tout en évitant un runtime Node caché.

Pour la sévérité, démarrer avec `correctness`, `suspicious`, `perf`, `restriction` et les règles TypeScript pertinentes à `error`; ne pas activer `pedantic`, `style` ou `nursery` globalement avant le corpus, car Oxlint les décrit respectivement comme susceptibles de faux positifs, idiomatiques, ou en développement. Les exceptions doivent être locales, motivées, et surveillées par la détection des disables inutilisés.

Sources : [configuration Oxlint](https://oxc.rs/docs/guide/usage/linter/config.html), [catégories et sévérités Oxlint](https://oxc.rs/docs/guide/usage/linter/cli), [configuration Oxfmt](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier).

### TypeScript 7 : utile mais avec limites connues

Le lint type-aware n’est pas inclus dans Oxlint seul : il demande `oxlint-tsgolint`. Celui-ci est un composant Go qui utilise `typescript-go`; Oxlint exige TypeScript **7.0+**. Il supporte actuellement 59 des 61 règles type-aware de typescript-eslint. `--type-check` peut remonter les diagnostics TypeScript et remplacer un `tsc --noEmit` dans la CI.

Limites à accepter explicitement : couverture pas totale, mémoire potentiellement élevée sur très grandes bases, et certaines options `tsconfig` héritées (notamment `baseUrl`) non supportées. Les options invalides deviennent visibles avec `--type-check`. Donc : activer `lint:types` en CI à partir du premier code, mais garder un test de compatibilité sur le `tsconfig` réel avant d’en faire l’unique gate de typecheck.

Sources : [lint type-aware Oxlint](https://oxc.rs/docs/guide/usage/linter/type-aware.html), [annonce tsgolint stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html), [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

## Garde-fous de structure avec Oxlint actuel

Les garde-fous de taille et de complexité demandés sont déjà natifs dans Oxlint : pas de plugin supplémentaire.

| Contrainte | Règle Oxlint officielle | Ce qu’elle couvre réellement | État |
|---|---|---|---|
| Cycles de modules | `import/no-cycle` (activer `plugins: ["import"]`) | tout chemin de dépendance résoluble qui revient au module, profondeur infinie par défaut | Oui |
| Taille de fichier | `max-lines` | lignes physiques, avec `max`, `skipBlankLines`, `skipComments` | Oui |
| Taille d’une fonction | `max-lines-per-function` | lignes par fonction, options `max`, `skipBlankLines`, `skipComments`, `IIFEs` | Oui |
| Complexité cyclomatique | `complexity` | chemins indépendants, `max` et variante `classic`/`modified` | Oui |
| Profondeur de blocs | `max-depth` | imbrication de blocs, `max` | Oui |
| Nombre de paramètres | `max-params` | signatures de fonction, `max`, traitement configurable du paramètre `this` | Oui |

Ces règles sont classées `pedantic` (`max-lines`, `max-lines-per-function`, `max-depth`), `style` (`max-params`) ou `restriction` (`complexity`) : elles ne doivent donc pas être supposées actives par une configuration minimale. Les déclarer explicitement à `error`, avec seuils versionnés. On peut ajouter sans nouvelle dépendance `max-statements` et `import/max-dependencies` pour limiter les modules qui accumulent trop de logique/dépendances. `import/max-dependencies` ne compte toutefois que les `import`, pas les `require`; imposer `typescript/no-require-imports` si l’on veut que cette limite ne soit pas contournable.

Sources : [catalogue des règles Oxlint](https://oxc.rs/docs/guide/usage/linter/rules), [`import/no-cycle`](https://oxc.rs/docs/guide/usage/linter/rules/import/no-cycle), [`max-lines`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines), [`max-lines-per-function`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-lines-per-function), [`complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity), [`max-depth`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-depth), [`max-params`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-params), [`import/max-dependencies`](https://oxc.rs/docs/guide/usage/linter/rules/import/max-dependencies), [`typescript/no-require-imports`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-require-imports).

### Imports par couche/feature : frontière exacte

Oxlint natif peut déjà interdire des spécificateurs d’import avec `no-restricted-imports` (exact, glob de type gitignore ou regex) et les `overrides` de configuration peuvent appliquer une liste différente selon les fichiers sources. Pour un petit nombre de couches fixes (`src/mcp/**`, `src/domain/**`, `src/infra/**`), cela suffit : chaque override interdit les chemins/familles non autorisés. `import/no-relative-parent-imports` peut aussi interdire les remontées `../` et `import/no-cycle` bloque les boucles.

Mais il manque deux capacités natives importantes :

1. aucune règle native équivalente à `import/no-restricted-paths` qui compare le fichier *importeur* et le fichier *résolu* par zones ; `no-restricted-imports` ne voit que le spécificateur écrit;
2. aucun matching capturé du type « `features/<A>` peut importer uniquement le public de `features/<A>` », sans créer à la main une override par feature. L’alias TypeScript et les imports dynamiques non littéraux sont aussi des frontières à traiter explicitement : `no-restricted-imports` ignore les `import(expr)` calculés.

Ainsi, les règles natives sont suffisantes pour les couches stables et globales; elles ne constituent pas une politique de dépendances par feature expressive et scalable.

Source : [`no-restricted-imports`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports), [`import/no-relative-parent-imports`](https://oxc.rs/docs/guide/usage/linter/rules/import/no-relative-parent-imports), [référence des overrides/config Oxlint](https://oxc.rs/docs/guide/usage/linter/config-file-reference).

### Complément minimal pour les frontières de feature

Le plus petit complément existant à essayer est **`eslint-plugin-boundaries`**, chargé comme JS plugin par Oxlint : il classifie les éléments via des patterns, puis définit des politiques `from → allow/disallow`; il supporte les couches, modules/features et les captures de patterns. Il remplit exactement le trou de zones/feature, sans écrire un linter propriétaire ni lancer ESLint.

Cependant, il faut le classer **expérimental avec Oxlint** : Oxlint déclare son API de plugins compatible ESLint v9+ mais la marque alpha; sa liste de plugins explicitement soumis à conformance tests ne cite pas `eslint-plugin-boundaries`. La configuration peut rester JSONC (`jsPlugins: ["eslint-plugin-boundaries"]`), donc être exécutée par `bun run lint`, mais un POC/fixture doit vérifier la résolution Bun, les alias TypeScript et toutes les politiques critiques avant de rendre la règle bloquante en CI. Ne pas ajouter `eslint-plugin-import` : Oxlint fournit déjà ses règles import natives (`no-cycle`, `max-dependencies`, etc.).

Sources : [eslint-plugin-boundaries — règles de dépendance et exemples](https://github.com/javierbrea/eslint-plugin-boundaries#readme), [plugins JS Oxlint : compatibilité et statut alpha](https://oxc.rs/docs/guide/usage/linter/js-plugins), [configuration `jsPlugins`](https://oxc.rs/docs/guide/usage/linter/config.html), [plugins import natifs Oxlint](https://oxc.rs/docs/guide/usage/linter/plugins).

### Conclusion d’audit Oxlint

Le plan sans linter maison est donc complet : démarrer uniquement avec les règles Oxlint natives et une `.oxlintrc.jsonc`; utiliser des `overrides` + `no-restricted-imports` pour les couches fixes; n’ajouter `eslint-plugin-boundaries` que lorsque des règles par feature/captures deviennent nécessaires. Son POC doit contenir des fixtures positives et négatives pour les alias TS, import type, dynamic import littéral et cross-feature, et s’exécuter avec `bun run lint`. Il ne doit pas être activé aveuglément : le support de plugins JS d’Oxlint est encore alpha.

## Audit MCP TypeScript SDK : stdio sous Bun sans ambiguïté

Audit du code source `modelcontextprotocol/typescript-sdk` au commit [`3924de9`](https://github.com/modelcontextprotocol/typescript-sdk/tree/3924de99df834302d89f5997a1b64ca268282284), le 25 août 2026. Le SDK courant est le découpage v2 (`@modelcontextprotocol/server`, version `2.0.0` dans son manifeste), différent des exemples historiques au paquet `@modelcontextprotocol/sdk` v1.

### Graphe réellement chargé par un serveur stdio

Pour l’import public suivant :

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
```

le graphe runtime pertinent est :

```text
@modelcontextprotocol/server/stdio
 ├─ server/stdio
 │   ├─ @modelcontextprotocol/core-internal      (aucun import `node:*` direct dans src)
 │   └─ @modelcontextprotocol/server/_shims
 │       └─ shimsNode (condition `node`, puis `default`)
 │           ├─ node:process                     ← import runtime exécuté
 │           └─ validateur AJV du SDK
 └─ server/serveStdio (si `serveStdio` est importé)

@modelcontextprotocol/server
 └─ index → fromJsonSchema → @modelcontextprotocol/server/_shims
    └─ même shimsNode → node:process
```

`server/stdio.ts` mentionne `node:stream` seulement en `import type`; TypeScript l’efface à l’émission. En revanche, il importe `process` depuis `_shims`; dans le manifeste du paquet, les conditions `workerd`, `browser`, `node`, `default` de `_shims` sélectionnent `shimsNode` sous Bun. Bun teste les conditions d’exports dans l’ordre du manifeste et reconnaît la condition `node`; `shimsNode.ts` importe bien `node:process` au runtime. Le package root charge aussi ce shim par `fromJsonSchema`, même si l’application n’appelle jamais une fonction stdio.

Conclusion précise : **le SDK s’exécute sous le runtime Bun, mais un serveur stdio via ses entrées officielles ne satisfait pas la règle stricte « aucun `node:*` chargé ».** Ce n’est pas Node.js : `node:process` est la couche de compatibilité implémentée par Bun. C’est néanmoins un import `node:*` runtime réel, pas seulement une déclaration de types.

Sources primaires : [transport stdio du serveur](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/server/stdio.ts), [barrel `stdio`](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/stdio.ts), [shim Node](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/shimsNode.ts), [shim browser qui interdit stdio](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/shimsBrowser.ts), [exports du package](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/package.json), [résolution des conditions Bun](https://bun.com/docs/runtime/module-resolution).

### Entrée Web/Bun sans `node:*` ?

Il existe une entrée Web-standard dans le SDK : `WebStandardStreamableHTTPServerTransport`, exportée depuis le root. Elle est faite pour HTTP `Request`/`Response`; ce n’est **pas** un transport stdio. Les branches `browser`/`workerd` du shim évitent `node:*`, mais retournent volontairement une erreur dès que `stdin` ou `stdout` est demandé. Le SDK ne publie ni condition d’export `bun`, ni sous-chemin Web/Bun pour un transport stdio.

`@modelcontextprotocol/core`/`core-internal` ne porte pas lui-même de transport serveur stdio public. Importer `core-internal` pour contourner le problème serait dépendre d’un package privé et non un contrat supporté. Donc, au 25 août 2026 : **aucune entrée officielle TypeScript du SDK ne fournit MCP stdio strictement Web APIs / zéro `node:*`.**

Sources : [root server sans stdio](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/index.ts), [shim Workerd](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/shimsWorkerd.ts), [transport Web standard du SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/3924de99df834302d89f5997a1b64ca268282284/packages/server/src/server/streamableHttp.ts).

### Alternative strictement Bun/Web : contrat minimal à posséder

Il n’existe pas d’alternative officielle prête à l’emploi qui réponde au double critère stdio + zéro `node:*`. La solution minimale est donc un **petit serveur MCP protocolaire local**, écrit seulement avec `Bun.stdin`, `Bun.stdout`, `TextDecoder`, `TextEncoder`, `AbortController` et JSON. Ce n’est pas un linter ou framework maison : c’est l’implémentation directe du binding MCP stdio.

Le contrat non négociable est borné :

1. lire stdin comme flux d’octets UTF-8, découper exactement une ligne par message et refuser ligne vide, JSON invalide ou message au-delà de la limite configurée;
2. écrire vers stdout exclusivement un objet JSON-RPC par ligne; logs uniquement sur stderr;
3. dispatcher JSON-RPC 2.0 : requête (`id`) → une réponse, notification sans réponse, erreurs `parse/invalid request/method not found/invalid params/internal`;
4. implémenter le handshake/capabilities MCP, `ping`, `tools/list`, `tools/call`, `notifications/initialized` et `notifications/cancelled`; lier chaque appel d’outil à un `AbortController` et ne plus écrire après annulation;
5. exposer le schéma tool et retourner les résultats tool (`content`, et éventuellement `structuredContent`) sans jamais transformer le contenu Web en commande;
6. fermer proprement sur EOF stdin : arrêter les opérations, fermer SQLite, puis arrêter seulement l’Obscura possédé par le processus.

Cela représente un noyau d’environ **6 comportements protocolaires, 5 méthodes MCP et 1 framing NDJSON**; estimation d’ingénierie : 250–450 lignes TypeScript hors schémas métier/tests, puis 25–40 tests de conformance (framing, JSON-RPC, handshake, tools, cancellation, backpressure/EOF). Cette estimation n’est pas une propriété de la spécification : elle sert à comparer le coût avec l’acceptation du seul shim `node:process` du SDK.

Le binding officiel impose : une requête/notification/réponse JSON-RPC par ligne sans newline intégré, stdin client → serveur, stdout serveur → client, aucune donnée non-MCP sur stdout, annulation par `notifications/cancelled`, et arrêt en fermant stdin puis `SIGTERM`/`SIGKILL` si nécessaire. Le serveur ne doit jamais envoyer de requête JSON-RPC vers le client sur stdio.

Sources : [spécification MCP stdio 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/stdio.mdx), [outils MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [JSON-RPC 2.0](https://www.jsonrpc.org/specification).

**Recommandation de décision :** si « jamais Node » signifie « aucun processus Node », garder le SDK est rationnel : Bun exécute son shim. Si cela signifie littéralement « aucun `node:*` au chargement », ne pas prétendre que le SDK est conforme; choisir le petit transport/protocole ci-dessus et conserver un corpus de messages de conformance versionné.

## Bun 1.4.0 : `bun test --parallel --isolate`

Sur Bun 1.4.0 installé, la syntaxe est valide et les options sont compatibles. `--parallel[=N]` lance les fichiers dans **N processus workers** (nombre de cœurs par défaut) et **implique déjà `--isolate`**. Ajouter `--isolate` est donc redondant, pas contradictoire. `--isolate` donne à chaque fichier un objet global frais; `--no-isolate` avec `--parallel` réutilise global et registre de modules à l’intérieur d’un worker, plus rapide mais avec fuites inter-fichiers possibles. Les tests d’un même fichier restent séquentiels par défaut; `--max-concurrency` ne limite que les tests explicitement concurrents / `--concurrent`.

Commandes recommandées :

```sh
# Unit + composants sans I/O externe : workers bornés, isolation explicite par lisibilité.
bun test --parallel=4 --isolate --timeout=10_000

# Intégration locale SQLite + Obscura : un seul flux, isolation des globals.
bun test --isolate --timeout=20_000 test/integration

# Smoke live Google : opt-in, sérialisé et jamais gate de CI.
OPEN_WEBSEARCH_LIVE=1 bun test --isolate --timeout=30_000 test/live
```

Ne jamais employer un même SQLite de workspace ou la même instance Obscura/port entre workers : l’isolation de global ne clone ni filesystem, ni ports, ni processus enfant. WAL accepte les lecteurs concurrents mais conserve un seul écrivain; les tests doivent avoir une base temporaire par fichier/test, ou être sérialisés. Les tests Obscura ne doivent pas lancer plusieurs `obscura serve` sur le même endpoint; préférer fixtures CDP/HTML pour les unit tests, et un processus supervisé exclusif dans l’intégration.

Google est intrinsèquement non déterministe (SERP, consentement, rate-limit/CAPTCHA, IP et contenu distant); aucun test Google réel ne doit tourner en parallèle, écrire dans le corpus de régression, ni décider d’un merge. Les snapshots/teacher runs sont les gates reproductibles; le live run produit seulement un rapport périodique.

Risques connus : un rapport public décrit un blocage avec `--parallel --isolate` sur une suite de plusieurs centaines de fichiers; ne pas extrapoler ce signal à notre petite suite, mais borner les workers, poser un timeout externe CI et surveiller temps/RSS dès que le corpus grossit. Bun fournit aussi `--timings`/`--update-timings` pour équilibrer shards et démarrer les fichiers lents.

Sources : [documentation Bun test : concurrence](https://bun.com/docs/test), [aide Bun 1.4.0 vérifiée localement](https://bun.com/docs/cli/test), [issue Bun sur le blocage `--parallel --isolate`](https://github.com/oven-sh/bun/issues/32251), [support `--timings` dans Bun 1.4](https://github.com/oven-sh/bun/issues/28792), [SQLite WAL Bun](https://bun.com/docs/runtime/sqlite).

## Installation d’Obscura au premier lancement

Obscura publie une archive macOS ARM64 ; sa documentation indique que l’archive contient `obscura` et `obscura-worker`, lesquels doivent rester dans le même répertoire. La release courante observée est `v0.2.1` et propose plusieurs variantes macOS ARM64, dont `-stealth`. **Les assets examinés ne contiennent pas de checksum, signature d’archive ni attestation publiés.** Une signature « verified » d’un commit/release GitHub ne vérifie pas à elle seule les bytes téléchargés.

Installer automatiquement est donc possible, mais doit être transparent et sûr dans ses limites :

1. la configuration épingle par défaut une version et une variante (`aarch64-macos-stealth` seulement si ses capacités sont nécessaires), jamais l’URL mutable `latest` ;
2. premier démarrage : proposer/télécharger explicitement l’archive depuis l’URL de release GitHub HTTPS, vers `~/Library/Application Support/open-websearch-mcp/obscura/<version>/`; le téléchargement est autorisé seulement pour l’installation, jamais dans le chemin de recherche ;
3. taille maximale attendue, fichier temporaire, hash SHA-256 local, validation de la liste tar (pas de chemins absolus/`..`), extraction vers répertoire temporaire puis renommage atomique ; permissions exécutables minimales et test `obscura --version` ;
4. ne pas appeler automatiquement `xattr -d com.apple.quarantine` et ne pas contourner Gatekeeper. Si macOS bloque le binaire, retourner une erreur d’installation et demander une action explicite ;
5. conserver manifeste local : version, URL complète, taille, hash local, date, résultat du smoke test. Sans checksum éditeur, afficher que l’intégrité est seulement locale/après téléchargement ;
6. une upgrade est un acte explicite (`install/update` CLI), téléchargée dans une nouvelle version, smoke-testée puis sélectionnée. Pas de mise à jour silencieuse ;
7. hors ligne : si une version saine est installée, la réutiliser. Sinon retourner `obscura_not_installed` avec la commande/diagnostic ; ne pas démarrer un fallback navigateur différent.

Le téléchargement initial est une dépendance réseau d’installation, mais le chemin normal `web_search` ne fait appel à aucune API SaaS ou clé externe. Il dépend du front Web Google et des sites ouverts, par conception.

Sources : [installation Obscura](https://github.com/h4ckf0r0day/obscura/wiki/Installation), [releases Obscura](https://github.com/h4ckf0r0day/obscura/releases), [archive release `v0.2.1`](https://github.com/h4ckf0r0day/obscura/releases/tag/v0.2.1).

## Dépendances initiales recommandées

| Dépendance | Statut | Raison |
|---|---|---|
| Bun, TypeScript 7 | obligatoire | runtime et vérification statique. |
| `@modelcontextprotocol/sdk` | obligatoire | protocole MCP stdio standard ; support Bun déclaré. |
| Obscura binaire épinglé | obligatoire | navigateur/rendu/CDP. |
| aucune lib CDP | obligatoire par défaut | WebSocket Bun + adaptateur CDP borné. |
| `@mozilla/readability` | candidat, après POC DOM | extraction Reader View éprouvée. |
| Cheerio | candidat, après POC | parsing HTML structurel Bun documenté ; pas un DOM Readability implicite. |
| Turndown + GFM | fallback candidat | seulement si le Markdown Obscura échoue au benchmark. |
| DOMPurify | seulement si HTML rendu/sortant est nécessaire | pas nécessaire pour une sortie texte/Markdown non active. |
| `pdfjs-dist` / robots parser | expérimentaux derrière extracteurs optionnels | ne les promettre qu’après test Bun et corpus. |

## Checks de démarrage/CI à rendre bloquants

1. `bun --version`, `tsc --version`, architecture `arm64`, et `obscura --version` correspondent au manifeste.
2. Obscura démarre sur loopback, endpoint CDP accessible, navigation/evaluation d’une fixture statique réussie, arrêt sans processus orphelin.
3. `SELECT sqlite_compileoption_used('ENABLE_FTS5')` et `CREATE VIRTUAL TABLE ... USING fts5` réussissent, WAL est activé ; test de transaction et reprise après interruption.
4. téléchargement simulé sans `Content-Length`, dépassant 25 MiB, archive tar malveillante et archive interrompue : aucun fichier final ou manifeste valide.
5. Readability/Markdown/GitHub conservent les code blocks ; sanitizer ne laisse aucun contenu actif ; les résultats restent marqués `external_untrusted`.
6. tests de compatibilité séparés pour chaque dépendance Node-oriented (MCP SDK stdio, PDF.js, robots parser). Une compatibilité annoncée avec Node ne vaut pas validation Bun.

## Audit packaging macOS ARM64 : Bun 1.4 et distribution MCP

### Ce que `bun build --compile` couvre réellement

`bun build --compile --target=bun-darwin-arm64` produit un exécutable qui embarque le runtime Bun, le code et les paquets **statiquement importés**. La documentation Bun affirme que les API Bun et Node intégrées sont supportées dans un exécutable compilé. Cela couvre donc le code applicatif, Zod et le SDK MCP lorsque leurs imports sont résolubles à la compilation ; cela ne change pas le verdict précédent sur le SDK : son entrée stdio charge réellement `node:process`, que Bun émule, et n’est donc pas « zéro `node:*` » au sens strict.

| Élément | Statut `--compile` arm64 | Décision de conception |
|---|---|---|
| `bun:sqlite` | **Supporté.** Bun le documente explicitement pour les exécutables compilés. Un smoke test local Bun 1.4.0 (`:memory:`, `CREATE`/`SELECT`) a compilé et exécuté avec succès. | Base mutable hors binaire, dans Application Support, avec chemin absolu calculé au runtime. Ne pas embarquer la DB de cache. |
| SDK MCP + Zod | **Supporté pour les dépendances statiques** par le bundling ; à valider avec les versions verrouillées du produit. | Acceptable si « sans Node » signifie sans processus Node. Sinon garder le transport MCP Bun/Web minimal décrit plus haut ; la compilation ne retire pas `node:process`. |
| Assets fixes | **Supportés**, via import `with { type: "file" }`, lus sous le chemin virtuel `$bunfs/`. | Réserver cela aux assets en lecture seule (schéma, liste de stopwords, template). Toute config, DB, cache ou journal modifiable doit être hors binaire. |
| Worker Bun | **Supporté sous condition.** Les entrypoints de worker doivent être inclus explicitement dans la compilation ; un worker dynamique/non listé est recherché depuis le répertoire courant puis échoue. | Déclarer chaque worker au build et faire un smoke test du binaire, ou préférer `Bun.spawn` pour le worker Obscura externe. |
| `Bun.spawn` / subprocess | L’API intégrée est couverte, mais un exécutable externe ne peut pas être supposé exécutable depuis `$bunfs/`. | Obscura reste un sidecar réel dans Application Support : chemin canonique, manifest/version, processus enfant supervisé. Ne pas chercher à l’embarquer comme simple asset. |
| `Bun.WebView` | **Indéterminé / spike requis.** WebView est encore expérimental et sa documentation explique qu’il lance un hôte auxiliaire ; elle ne garantit pas sa compatibilité avec `--compile`. Un essai de navigation WebView normal puis compilé n’a produit aucun résultat dans ce sandbox, donc ne permet pas de conclure. | Ne pas bloquer v1 sur WebView. Faire un spike sur Mac physique avant de le considérer distribué ; Obscura est le renderer de production. |

Le test concret effectué ne valide que `bun:sqlite`, pas tout le tableau :

```sh
bun build --compile --target=bun-darwin-arm64 sqlite.ts --outfile sqlite-probe
./sqlite-probe # SELECT renvoie "ok"
```

Le binaire n’est pas un système de fichiers permanent. En particulier, une base SQLite importée avec `with { type: "sqlite", embed: "true" }` s’ouvre en mémoire et ses écritures disparaissent à l’arrêt : utile pour une base de référence figée, incorrect pour l’index/caching de recherche. Les chemins relatifs d’une base externe dépendent du CWD : tous les chemins persistants doivent donc être explicitement dérivés d’un dossier Application Support, jamais du CWD choisi par le harness.

Sources : [exécutables Bun](https://bun.com/docs/bundler/executables), [SQLite dans un binaire compilé](https://bun.com/docs/bundler/executables#sqlite), [workers dans un binaire compilé](https://bun.com/docs/bundler/executables#workers), [WebView Bun (expérimental)](https://bun.com/docs/runtime/webview), [API `Bun.spawn`](https://bun.com/docs/runtime/child-process), [SQLite Bun](https://bun.com/docs/runtime/sqlite).

### Spikes de release à exiger avant de promettre le binaire

Les quatre spikes suivants sont courts et non substituables par la documentation :

1. compiler le véritable entrypoint verrouillé (SDK MCP/Zod/SQLite), lancer `initialize`, `tools/list` et un `tools/call` par stdin ; contrôler avec `otool -L` et un lancement sur un Mac arm64 propre ;
2. compiler un worker réel, vérifier que l’entrypoint est embarqué et qu’un échec de worker est rendu sur stderr sans corrompre stdout MCP ;
3. compiler WebView, ouvrir une `data:` URL, puis créer/fermer dix fenêtres et vérifier qu’aucun hôte WKWebView ne reste vivant. Tant que ce test n’est pas vert, aucune dépendance produit à WebView ;
4. lancer dans le binaire compilé le sidecar Obscura installé à côté, vérifier le signal d’arrêt, l’EOF stdin et l’absence de processus orphelin.

### Signature, notarisation et quarantaine macOS

Un binaire construit localement pour l’usage personnel ne porte normalement pas le drapeau de quarantaine d’un téléchargement. En revanche, un artefact distribué depuis GitHub ou un site est évalué par Gatekeeper : Apple demande une signature Developer ID avec Hardened Runtime et timestamp pour la notarisation. Un exécutable autonome peut être notarisé, mais **le ticket de notarisation ne peut pas être staplé à un simple binaire** ; Apple recommande donc de livrer le binaire signé dans un `.dmg`, `.pkg` ou un app bundle notarisé, auquel le ticket peut être attaché.

Il ne faut ni demander à l’utilisateur de désactiver Gatekeeper, ni exécuter `xattr -d com.apple.quarantine`. Tout exécutable livré ensemble doit avoir une provenance et être signé dans la chaîne de release. C’est précisément un point dur pour l’installation différée d’Obscura : une archive GitHub non notariée/téléchargée ultérieurement peut être mise en quarantaine ou bloquée. Jusqu’à ce qu’Obscura fournisse une chaîne de signature/notarisation vérifiable (ou qu’une distribution ait l’autorité de le redistribuer et le signer), le bootstrap doit échouer proprement avec un diagnostic, pas contourner macOS.

Sources : [notarisation d’un logiciel macOS (Apple)](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [workflow de notarisation et limites du stapling (Apple)](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow), [Gatekeeper pour les apps téléchargées (Apple)](https://support.apple.com/en-ie/102445).

### UX MCP : binaire autonome vs paquet Bun

Tous les clients ciblés savent lancer un serveur stdio local par une commande ; un exécutable avec chemin absolu est donc portable entre les harnesses. Codex partage cette configuration entre l’app desktop, CLI et IDE dans `~/.codex/config.toml`; Claude Code, OpenCode et Gemini CLI prennent eux aussi une commande locale et ses arguments. Le serveur ne doit jamais compter sur le CWD ou un `PATH` partiel : fournir un chemin absolu vers son launcher et utiliser une racine de données explicite.

| Distribution | Expérience au démarrage auto du harness | Avantages | Coûts/risques |
|---|---|---|---|
| Binaire Bun compilé | `command` pointe vers un seul fichier arm64 ; aucun Bun ni Node préinstallé nécessaire. | Le plus universel une fois installé ; démarrage froid minimal ; même config Codex/Claude/OpenCode/Gemini. | Chaîne CI de signature/notarisation ; WebView compilé non prouvé ; sidecar Obscura reste à installer, signer et mettre à jour séparément. |
| Paquet Bun déjà installé (recommandé v1) | Le harness lance le **chemin absolu de Bun** et un entrypoint/CLI local déjà installé. | Vraiment Bun-only, itération et rollback simples, dépendances lockées, pas de release signature pour usage personnel, diagnostic facile. | Bun doit être installé ; le premier `bun install` est une étape explicite ; ne pas dépendre du `PATH` hérité du harness. |
| `bunx` à chaque lancement | Le harness lance `bunx --bun` avec un paquet/version épinglé. | Installation initiale la plus courte. | Résolution/cache/réseau au démarrage, moins déterministe et plus fragile hors ligne ; `--bun` doit être explicite pour empêcher l’interprétation d’un shebang Node. Non recommandé pour un serveur de fond. |

**Recommandation :** pour la première version personnelle macOS, distribuer un paquet Bun verrouillé et l’installer une fois ; enregistrer dans chaque harness une commande à chemin absolu vers Bun/son launcher. Cela respecte « jamais Node », élimine la complexité de notarisation pendant l’itération et laisse Obscura comme sidecar versionné. Passer ensuite au binaire `--compile` **seulement** après les quatre spikes ci-dessus et une chaîne DMG/PKG signée/notarisée incluant ou gérant explicitement Obscura. Ce passage est une optimisation d’UX de distribution, pas un prérequis pour un MCP stdio rapide.

Sources : [MCP local Codex : stdio et `config.toml`](https://learn.chatgpt.com/docs/extend/mcp), [Claude Code MCP local stdio](https://code.claude.com/docs/en/mcp), [OpenCode MCP local](https://opencode.ai/v2/docs/mcp-servers), [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/), [`bunx --bun`](https://bun.com/docs/pm/bunx).
