# Recherche : un WebSearch MCP réellement local

Date de recherche : 2026-08-25. Cette note s'appuie sur des sources qui
possèdent l'implémentation ou le service décrit (documentation produit,
dépôts source, conditions d'utilisation). Elle ne confond donc pas une API de
recherche, un méta-moteur et un navigateur de rendu.

## Conclusion courte

Il est possible de rendre l'étape **fetch/extraction** locale, rapide et de
bonne qualité avec Obscura + un extracteur de contenu. Il n'est pas possible
de reproduire localement, gratuitement et instantanément la **découverte Web
globale** de Brave ou Exa : leur valeur centrale est un index préalablement
crawlé à grande échelle, avec une infrastructure de ranking. Un navigateur qui
interroge Google en parallèle n'est ni cet index ni une base suffisamment
fiable pour un produit (fragilité anti-bot et dépendance contractuelle).

La proposition réaliste est donc un MCP en deux niveaux :

```text
query → source de découverte interchangeable → fusion/ranking des URLs
      → fetch rendu local en parallèle (Obscura) → extraction + contrôle qualité
      → dédoublonnage + passages pertinents → réponse compacte, traçable au LLM
```

En local par défaut, la découverte peut être fournie par une instance SearXNG
auto-hébergée, mais elle reste un **méta-moteur** : ses résultats viennent des
moteurs qu'elle interroge. Pour une indépendance forte, il faut faire croître
son propre corpus (d'abord des domaines/documents ciblés), son index lexical et
vectoriel, puis son crawler. Les deux modes doivent coexister derrière une
interface MCP identique.

## Ce que font Brave et Exa

| Service | Documenté par le fournisseur | Ce que cela implique pour le projet |
| --- | --- | --- |
| Brave Search | Brave affirme que son API s'appuie sur son propre index indépendant, non sur un scraping de Google/Bing. Il indique crawler des millions de pages chaque jour et compléter ce crawl via le Web Discovery Project (visites/recherches anonymisées sur opt-in). La page précise aussi qu'une page `noindex`, ou non crawlable par Googlebot, ne sera pas crawlée par Brave. [Brave API : FAQ](https://brave.com/search/api/) | Le résultat est le produit d'un index persistant + ranking propriétaire, pas celui d'un navigateur lancé à la demande. L'API est externe et commerciale ; elle peut être un adaptateur optionnel, non la définition de l'architecture. |
| Brave Search | L'API expose recherche Web/news/images, snippets, métadonnées et les *Goggles* (filtrage/reranking configurables). [Documentation API](https://api-dashboard.search.brave.com/documentation) | Les Goggles montrent où placer notre politique locale : **après** la découverte, comme un ranker/filtre pluggable par profil ("official sources", langue, domaines, fraîcheur). Leur formule exacte de ranking n'est pas publique dans ces sources. |
| Exa | Exa décrit trois étages : découverte/crawl distribué de nouvelles URLs, parsing HTML et stockage ; prétraitement de milliards de documents en embeddings par modèles spécialisés ; service de requête sur une base vectorielle maison. [Article technique Exa](https://exa.ai/blog/how-to-build-nextgen-search) | Exa est d'abord un moteur/index neuronal. L'analogue local n'est pas une requête Google, mais un corpus persistant + embeddings + recherche hybride + reranking. Le détail des modèles, sources de seeds, schéma d'index et formule de score n'est pas documenté publiquement. |
| Exa | L'API `/search` accepte une requête en langage naturel, plusieurs modes (`instant`, `fast`, `auto`, `deep...`), filtres et contenu ; `/contents` retourne texte nettoyé, highlights, résumé et peut live-crawler/crawler des sous-pages. La documentation précise cache/fraîcheur (`maxAgeHours`) et les erreurs par URL (403, timeout, etc.). [Search](https://exa.ai/docs/reference/search), [Contents](https://exa.ai/docs/reference/contents-api-guide) | C'est un bon contrat de sortie à reproduire : résultat URL/métadonnées + statut de collecte + texte, et un mode `highlights` calculé localement. En revanche, les résumés Exa ne sont pas de l'extraction ; ce sont du traitement LLM fourni par Exa. |

**Inférence explicitement limitée.** Brave et Exa disposent vraisemblablement de
scores de qualité/fraîcheur, de déduplication et de scheduling de crawl puisque
leurs produits en ont besoin ; leurs algorithmes et leurs index complets sont
inconnus publiquement. Les revendiquer comme reproductibles à l'identique serait
spéculatif.

## Découverte de résultats : choix et limites

### 1. SearXNG auto-hébergé : bon adaptateur, pas un index

SearXNG a une API HTTP (`/search`, sorties JSON/CSV/RSS configurables) et un
catalogue d'"engines" configurable, y compris un moteur JSON générique qui
mappe les champs d'une API partenaire vers URL/titre/snippet.
[API](https://docs.searxng.org/dev/search_api.html),
[moteur JSON](https://docs.searxng.org/dev/engines/json_engine.html).

Il convient pour normaliser et fusionner des fournisseurs autorisés (ou des
verticales : MDN, arXiv, GitHub, sites de documentation). Mais lorsqu'un moteur
n'a pas d'API, SearXNG dépend de son format HTML et de son anti-bot : le code du
moteur Google détecte explicitement les pages `sorry`/CAPTCHA, et sa
configuration prévoit des suspensions après 403/429/CAPTCHA.
[implémentation Google](https://docs.searxng.org/_modules/searx/engines/google.html),
[politique de suspension](https://docs.searxng.org/admin/settings/settings_search.html).
Donc : ne pas promettre une disponibilité Google ; instrumenter par moteur les
taux de succès, latence et motifs d'échec, puis basculer vers d'autres moteurs.

### 2. Google/Bing/DDG : ne pas bâtir sur du SERP scraping

* L'API Google Custom Search JSON est fermée aux nouveaux clients et annoncée
  comme arrêtée le 1er janvier 2027 ; les clients existants ont 100 requêtes/jour
  gratuites, puis $5/1000 jusqu'à 10k/jour. [Google](https://developers.google.com/custom-search/v1/overview)
* Les Bing Search APIs ont été retirées le 11 août 2025. Microsoft renvoie vers
  Grounding with Bing Search dans Azure AI Agents : ce n'est donc pas une API
  WebSearch locale et indépendante. [Microsoft](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)
* Les conditions Google interdisent notamment l'accès automatisé qui viole les
  instructions machine-readable comme `robots.txt`, et l'usurpation de l'origine
  d'un service. [Google Terms](https://policies.google.com/terms?hl=en-US)

Les résultats non authentifiés d'un SERP rendu dans Obscura peuvent rester un
**connecteur expérimental** et explicitement best-effort, si les règles du site
le permettent. Ce n'est pas une dépendance de production : JS rendu, proxy ou
mode stealth ne donnent ni droit d'accès ni garantie contre CAPTCHA, limitation
ou changement de DOM.

### 3. Index propre : seule voie vers l'autonomie

Un index global est un chantier d'infrastructure. Le chemin crédible est :

1. démarrer avec des *seeds* déclarés (sitemaps, RSS/Atom, docs et domaines
   autorisés) et une file de crawl par domaine ;
2. respecter `robots.txt`, `noindex`, limites par hôte, canonical URLs et
   politiques éditeur ;
3. persister HTML rendu, contenu extrait, métadonnées, date/ETag, hash et liens ;
4. indexer BM25/lexical + vecteurs de passages ;
5. mesurer couverture, fraîcheur, taux de pages utiles et qualité de ranking
   plutôt que prétendre couvrir "le Web".

Ce modèle suit les trois phases publiquement décrites par Exa (crawl,
prétraitement, serving), mais l'échelle et la qualité d'Exa ne sont pas des
propriétés qu'un prototype local hérite automatiquement.

Une solution OSS existante à évaluer comme référence ou accélérateur est
[YaCy](https://www.yacy.net/) : le projet se présente comme un moteur de
recherche décentralisé avec crawl et index, et documente une
[API de pilotage du crawler](https://yacy.net/api/crawler/). Cela le distingue
de SearXNG : YaCy peut réellement constituer un index local, mais sa couverture,
sa fraîcheur et sa qualité seront celles du crawl qu'on lui donne. Cette note ne
conclut pas sur ses performances : elles doivent être mesurées sur le corpus de
validation.

## Rendu et extraction locale

### Obscura identifié

Le projet correspondant est [h4ckf0r0day/obscura](https://github.com/h4ckf0r0day/obscura),
licence Apache-2.0. Son README documente un navigateur headless avec rendu JS,
un serveur CDP utilisable depuis Playwright/Puppeteer, `fetch` avec dumps HTML,
texte, liens ou Markdown, et `scrape` parallèle avec `--concurrency`.
[README](https://github.com/h4ckf0r0day/obscura). Il peut donc être le moteur de
collecte local ; un pool persistant de processus CDP est préférable à un
processus frais par URL.

**Limite importante, documentée par l'état du projet.** Obscura propose un mode
stealth, mais un ticket du dépôt décrit une incompatibilité CDP et l'échec du
JavaScript Cloudflare Rocket Loader pour une SPA protégée.
[issue #64](https://github.com/h4ckf0r0day/obscura/issues/64). Le rendu JS résout
les pages qui nécessitent JS ; il ne "bypass" pas l'authentification, les WAF,
CAPTCHA ou paywalls. Prévoir le statut `blocked/auth_required/render_failed` et,
pour les accès légitimes, des contextes de cookies isolés et explicitement
autorisés — jamais le partage implicite de la session d'un utilisateur.

### Extracteur : stratégie de repli, pas une heuristique unique

* [Mozilla Readability](https://github.com/mozilla/readability) est la
  bibliothèque de Firefox Reader View. Elle prend un DOM et retourne titre,
  HTML traité, `textContent`, extrait, auteur, site, langue et date. Elle offre
  `isProbablyReaderable`; sa documentation avertit que cette présélection a des
  faux positifs/négatifs et que `parse()` modifie le DOM. Elle recommande de
  sanitizer le HTML non fiable avant toute réinjection dans une UI.
* [Trafilatura](https://github.com/adbar/trafilatura) est une option Python
  robuste : découverte (sitemaps/feeds), déduplication d'URL, extraction du
  texte principal et métadonnées. Sa documentation décrit des modes
  précision/rappel et des extracteurs de secours si le résultat est trop court.
  [Vue d'ensemble d'extraction](https://trafilatura.readthedocs.io/en/latest/extraction-overview.html)

Recommandation : conserver le HTML rendu, puis faire une cascade
`Readability → Trafilatura → texte DOM/Markdown Obscura`, en évaluant chaque
sortie au lieu de choisir aveuglément la première : longueur minimum/maximum,
ratio texte/liens, densité de répétitions, présence de titre et de paragraphes,
similarité avec le titre/snippet de recherche. Garder l'extraction gagnante et
son `extractor_version`, et retourner les liens **du contenu principal**
(URL absolue, anchor text, `rel`, même domaine ou externe), distincts de tous
les liens du DOM. Ce dernier point est une décision d'architecture, non une
fonctionnalité affirmée pour chacun des extracteurs.

## Ranking, déduplication et compression adaptés LLM

Cette partie est une conception proposée, pas une description publique du
ranking Brave/Exa.

1. **Normaliser.** Canonical URL si disponible, sinon suppression contrôlée des
   paramètres de tracking ; conserver l'URL originale. Ne jamais fusionner des
   URLs seulement parce que leurs titres se ressemblent.
2. **Dédupliquer en deux étages.** D'abord URL/canonical exact et hash de
   contenu ; ensuite near-duplicate par shingles/MinHash ou similarité des
   embeddings de texte extrait. Conserver la version la plus fraîche, la plus
   longue et la mieux extraite, en traçant les doublons écartés.
3. **Reranker.** Une première passe hybride rassemble lexical (titre, URL,
   BM25) et sémantique (embedding des titres/passages), puis un reranker
   cross-encoder seulement sur le top-K. Ajouter des boosts transparents
   (domaine explicitement préféré, fraîcheur, langue, source officielle) et
   des pénalités (échec partiel, contenu maigre, duplicat). Les poids doivent
   être versionnés et évalués sur un jeu de requêtes.
4. **Compresser sans inventer.** Découper le contenu en passages avec contexte
   de heading ; retourner les K passages les plus pertinents, accompagnés de
   URL, titre, date, score et offsets/citations. Un résumé génératif est une
   étape optionnelle et séparée, qui doit citer ces passages. C'est l'analogue
   local des `highlights` token-efficient d'Exa, sans attribuer au système une
   capacité de synthèse non vérifiée.
5. **Défense LLM.** Le Web est une entrée non fiable : encapsuler le texte comme
   citation, retirer scripts/styles/éléments cachés, limiter taille et nombre
   de liens, ne jamais exécuter d'instructions présentes dans la page, et
   conserver la provenance URL/date/hash. Cette recommandation de sécurité est
   une décision de produit.

## Architecture MCP proposée (v1)

### Composants

| Composant | Responsabilité | État local |
| --- | --- | --- |
| `DiscoveryProvider` | reçoit query/filtres, retourne résultats normalisés ; implémentations SearXNG, index local et optionnellement fournisseurs payants autorisés | cache court de SERP + métriques par fournisseur |
| `UrlPlanner` | fusionne, canonicalise légèrement, déduplique les URLs avant le fetch et alloue budget/host | file et limites par hôte |
| `RenderWorker` | Obscura CDP/CLI, timeouts, attente d'état, captures d'échecs | cookies seulement dans profils explicitement configurés |
| `Extractor` | cascade extraction + liens pertinents + évaluation de qualité | HTML/texte/hash/version extracteur |
| `LocalIndex` (optionnel v1, central v2) | BM25 + index vectoriel de documents/passages ; refresh et suppression | documents, passages, vecteurs, dates |
| `EvidenceComposer` | dedupe final, reranking, budgeting de tokens, citations et statuts | cache de résultats de requête |

### Outils MCP minimaux

* `web_search(query, max_results=8, freshness?, domains?, language?)` :
  découvre, fetch le top-N selon budget, et retourne une liste d'évidences
  compactes `{title, url, published_at?, snippet, passages[], links[],
  retrieval_status, provenance}`. `retrieval_status` est indispensable : une
  absence de texte ne doit jamais se faire passer pour "aucun résultat".
* `web_fetch(url, mode="article"|"links"|"html")` : rendu local et extraction
  d'une URL connue ; utile quand l'agent sait déjà quoi lire.
* `web_crawl(seed, scope, max_pages)` : outil séparé, explicite et limité pour
  alimenter l'index local ; jamais déclenché implicitement par une recherche.

Ne pas exposer d'emblée les primitives navigateur arbitraires (`evaluate`,
click/login) dans le même MCP que la recherche : elles ont un modèle de sécurité
et de consentement distinct. Obscura expose lui-même un MCP navigateur ; notre
MCP doit rester orienté **evidence retrieval**.

### Exécution d'une requête

```text
web_search
  ├─ index local (si couverture suffisante) ──────────┐
  ├─ SearXNG / fournisseurs autorisés ── normalisation ├─ top 12 URLs
  └─ cache récent ────────────────────────────────────┘
       → quotas par domaine + 4–12 renders Obscura en parallèle
       → extraction en cascade + qualité + status par URL
       → déduplication contenu + reranking des passages
       → top 5–8 sources, passages citables et liens de suivi
```

Les nombres sont des budgets initiaux à benchmarker, pas des seuils issus des
fournisseurs. Utiliser deux délais : un délai dur de navigation et un budget de
settling ; Obscura documente précisément ces contrôles (`--timeout`,
`--wait-until`, `--wait`, `--selector`).

## Plan de validation avant implémentation

1. Constituer 50–100 requêtes réalistes (technique, actualité, docs, pages JS,
   PDF, sites bloqués), avec résultats attendus et contraintes de domaine.
2. Mesurer séparément : disponibilité de découverte, TTFB/temps rendu, succès
   extraction, caractères utiles, précision top-K, taux de doublons et coût
   CPU/RAM. Segmenter par domaine et fournisseur.
3. Comparer `Obscura + Readability`, `Obscura + Trafilatura`, puis cascade sur
   le même lot. Inspecter manuellement les échecs structurés (tableaux, docs,
   SPA, paywall) avant d'ajouter une règle.
4. Livrer d'abord `web_fetch` local (valeur immédiate), puis `web_search` avec
   SearXNG/adaptateurs et cache ; ne déclencher le crawler/index maison que pour
   un périmètre vertical mesurable.

## Compatibilité MCP des principaux harnesses (constat au 2026-08-25)

### Ce que le protocole exige, avant de parler des clients

Le protocole MCP n'a pas un numéro de version intemporel : le client envoie une
révision date dans `initialize.protocolVersion`; le serveur répond avec la
révision convenue et ses capacités, puis le client envoie
`notifications/initialized`. Le client et le serveur ne doivent ensuite
utiliser que la révision et les capacités négociées.
[Lifecycle MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle).
`tools/list` (paginé) et `tools/call` sont des opérations standard ; un résultat
de tool peut contenir `content`, `isError` et `structuredContent`.
[Schéma MCP 2025-06-18](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts).

La cancellation ordinaire est `notifications/cancelled` avec l'ID d'une requête
encore en vol ; le récepteur devrait cesser le travail. En 2025-11-25, la
spécification introduit aussi des `tasks/*` expérimentales, qui ont leur propre
`tasks/cancel`; elles ne sont donc pas une dépendance portable de cette v1.
[Cancellation/tasks 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks).
Sur stdio, la fermeture ordonnée est EOF de stdin, puis SIGTERM/SIGKILL si
nécessaire. Le protocole recommande par ailleurs une limite de temps par
requête, puis cancellation et arrêt d'attente.
[Lifecycle : stdio et timeouts](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle).

### Matrice : documenté vs vérifié dans le source

« Vérifié source » signifie ici : inspection du code/repo officiel au commit le
plus récent daté au plus tard le 25 août 2026, ou de la version locale indiquée.
Ce n'est **pas** une promesse de stabilité future ni la preuve qu'une version
antérieure précise se comporte ainsi. « Non documenté » ne signifie pas que la
fonction est absente : seulement qu'il ne faut pas la présupposer pour le
contrat de notre serveur.

| Client | stdio / `initialize` / `tools/list` / `tools/call` | `structuredContent` | cancellation d'un appel en cours | État de preuve |
| --- | --- | --- | --- | --- |
| Codex CLI 0.149.1 | **Oui, vérifié source.** Le client MCP RMCP a 2025-06-18 comme protocole normal ; le code de conformance prévoit aussi la révision 2026-07-28 derrière le feature flag `mcp_2026_07_28`. Le repo teste l'initialisation, la découverte et les appels. [client](https://github.com/openai/codex/blob/4fa6ad173055f6438e8baf81cd55cb59f46179d7/codex-rs/mcp/src/rmcp_client.rs), [suite de conformance](https://github.com/openai/codex/blob/4fa6ad173055f6438e8baf81cd55cb59f46179d7/scripts/mcp_conformance/server.py) | **Oui, vérifié source.** La suite renvoie et vérifie `structuredContent`. | **Ne pas compter dessus sans probe.** Un bug ouvert sur 0.128.0 constatait que le travail cessait mais que la requête `tools/call` ne se résolvait jamais après `notifications/cancelled`. [issue officielle](https://github.com/openai/codex/issues/20925) | Protocole/tool output : vérifié ; fin de cancellation : régression historiquement observée, à tester sur 0.149.1. |
| Claude Code | **stdio local : oui, documenté.** `claude mcp` est le mécanisme de configuration MCP. [référence CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage) | **Oui, documenté.** Les custom tools retournent des données structurées ; la documentation précise toutefois que les blocs texte de `content` ne sont pas transmis quand ces données sont présentes. [Agent SDK](https://code.claude.com/docs/en/agent-sdk/custom-tools#return-structured-data) | Non documenté publiquement comme contrat. Une issue officielle rapporte l'envoi de `notifications/cancelled` sur stdio, mais ce n'est qu'un comportement observé. [issue](https://github.com/anthropics/claude-code/issues/51073) | stdio/structured : documentés ; révision wire et cancellation : probe d'intégration requis sur la version ciblée. |
| Gemini CLI | **Oui, vérifié source et documenté.** Sa doc indique Stdio/SSE/Streamable HTTP, la récupération des définitions MCP et leur enregistrement ; le source passe par `@modelcontextprotocol/sdk` 1.23.0, appelle `listTools` et `callTool`. [doc](https://github.com/google-gemini/gemini-cli/blob/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8/docs/tools/mcp-server.md), [client](https://github.com/google-gemini/gemini-cli/blob/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8/packages/core/src/tools/mcp-client.ts), [dépendance](https://github.com/google-gemini/gemini-cli/blob/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8/packages/core/package.json) | **Non transmis au modèle dans ce snapshot.** Le chemin de conversion ne consomme que `result.content`; il faut donc toujours renseigner `content`. [mcp-tool](https://github.com/google-gemini/gemini-cli/blob/812f7a2bcf20b6e80e2e50c3c8fa8e26567bc1e8/packages/core/src/tools/mcp-tool.ts) | **Non envoyé pour les outils normaux dans ce snapshot.** `callTool` reçoit seulement `{timeout}`, pas de `AbortSignal`; l'annulation locale ne devient pas une notification MCP. | stdio/list/call : vérifiés ; structured/cancel : limitation vérifiée au snapshot. |
| OpenCode | **Oui, vérifié source et documenté.** La doc appelle explicitement `type: local` un serveur lancé en transport stdio ; elle documente les délais startup/catalog/execution. [doc](https://opencode.ai/v2/docs/mcp-servers) ; le snapshot utilise SDK MCP 1.29.0, appelle `listTools` (pagination) et `callTool`. [catalogue](https://github.com/anomalyco/opencode/blob/69aaa22793bcbe0b016ad9cfad22616906766df0/packages/opencode/src/mcp/catalog.ts) | **Oui, vérifié source.** Il préserve `content` et `structuredContent`, et, si `content` est vide, sérialise `structuredContent` en texte. [catalogue](https://github.com/anomalyco/opencode/blob/69aaa22793bcbe0b016ad9cfad22616906766df0/packages/opencode/src/mcp/catalog.ts) | **Câblé, à confirmer bout-en-bout.** OpenCode passe `options.abortSignal` au `callTool`; le SDK peut donc émettre `notifications/cancelled`. Il faut encore vérifier avec le binaire/version publiés que le serveur reçoit la notification et que la requête se termine proprement. | stdio/list/call/structured : vérifiés ; cancellation : preuve de câblage, probe requis. |

Les commits ci-dessus sont volontairement figés afin de rendre ce constat
reproductible. Pour Codex, `codex --version` dans cet environnement retournait
`0.149.1`; pour Gemini et OpenCode, les snapshots datés sont respectivement
`812f7a2...` et `69aaa22...`. Les versions de distribution effectivement
installées chez l'utilisateur restent la source de vérité opérationnelle.

### Contrat de compatibilité recommandé pour le binding Bun strict

1. **Négocier, plutôt que figer une version.** Supporter `2024-11-05` et
   `2025-06-18` au minimum (ce dernier est le baseline Codex/Gemini vérifié),
   et répondre avec la version effectivement supportée/convenue. Si aucune ne
   convient, retourner une erreur JSON-RPC claire avec `data.supported`.
   N'annoncer `2025-11-25`/`2026-07-28` qu'après les probes correspondants.
2. **Implémenter le sous-ensemble sûr.** `initialize` →
   `notifications/initialized` → `tools/list` (curseur accepté, même si une
   seule page) → `tools/call`; capacités serveur `{ tools: { listChanged:
   false } }`; stdio JSON-RPC, une ligne/objet par message et logs uniquement
   sur stderr. Accepter `_meta` inconnu et n'exiger aucune capacité client non
   nécessaire.
3. **Résultat portable : texte d'abord.** Pour chaque `tools/call`, retourner
   un `content` texte compact et canonique; `structuredContent` conforme à
   l'`outputSchema` peut être ajouté en opt-in/profil client. Gemini l'ignore
   dans le snapshot étudié ; Claude Code documente que les blocs texte ne sont
   pas transférés lorsque les données structurées sont présentes. Il ne faut
   donc jamais dépendre de la redondance pour transmettre une donnée essentielle.
4. **Cancellation coopérative et idempotente.** Accepter
   `notifications/cancelled`, annuler AbortController/pool Obscura, libérer les
   slots, et tolérer qu'aucune réponse terminale ne soit consommée (la spécification
   demande au receveur de cesser le travail et à l'émetteur d'ignorer une réponse
   tardive). Prévoir aussi EOF/SIGTERM. Ne pas implémenter `tasks/*` v1.
5. **Une conformance executable par client/version.** Un faux serveur stdio
   capture l'ordre et les payloads : version proposée/négociée, `initialized`,
   pagination de `tools/list`, validation d'arguments, résultat avec
   `content+structuredContent`, erreur `isError`, progress optionnel, et
   cancellation pendant un appel bloquant. La CI lance le même corpus contre
   les binaires épinglés de Codex, Claude Code, Gemini CLI et OpenCode ; une
   nouvelle version ne passe en support « vérifié » qu'après cette matrice.

Le test le plus important est volontairement petit : un outil `probe` qui
attend sur un AbortSignal et un outil `echo` retournant texte + JSON structuré.
Avant de juger le rendu Web, il établit exactement le contrat transport qui
empêche les hangs, les JSON perdus et les incompatibilités silencieuses.

## Questions à trancher

* Quel périmètre légal/opérationnel est accepté pour les fournisseurs de
  découverte : uniquement APIs contractuelles, ou aussi moteurs HTML dans
  SearXNG en best-effort ?
* La promesse est-elle "Web général assisté" (donc dépendance d'index tiers
  assumée) ou "indépendance" (donc budget crawl/index et couverture limitée au
  départ) ?
* Quels profils d'identité/cookies sont autorisés, et pour quels domaines ?
  Sans réponse explicite : aucune authentification, aucun contournement.
* Quel langage/runtime de l'MCP ? Obscura est Rust/CDP mais Readability est
  JavaScript et Trafilatura Python ; un service d'extraction isolé ou une
  cascade via sous-processus est plus simple qu'une réimplémentation prématurée.
