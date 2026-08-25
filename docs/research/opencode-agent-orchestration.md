# OpenCode 1.18.23 — capacités d'orchestration agentique

Date de vérification : 25 août 2026. Cible : l'orchestrateur d'implémentation qui sera exécuté par **OpenCode 1.18.23** sur macOS, avec plusieurs modèles déjà configurés par l'utilisateur.

## Conclusion opérationnelle

OpenCode fournit les briques nécessaires pour une boucle d'implémentation robuste : agents spécialisés, sous-agents, choix explicite du modèle, exécution non interactive, sessions persistantes/exportables et serveur HTTP local documenté. Il ne fournit pas, dans cette version, un ordonnanceur de worktrees ni une garantie qu'un agent continue indéfiniment sans relance. Ces deux responsabilités doivent donc rester dans l'orchestrateur du dépôt : il crée les worktrees avec Git, applique des budgets/limites, enregistre des checkpoints Git + Markdown, puis relance explicitement la prochaine étape.

La bonne architecture est un **orchestrateur primaire unique** dans un worktree d'intégration, avec des agents spécialisés à permissions minimales. Les implémenteurs travaillent dans un worktree dédié à une sous-spec ; les reviewers sont sans droit d'édition ; l'orchestrateur est le seul acteur autorisé à intégrer, créer une PR ou modifier l'état de progression.

## Périmètre vérifié et prudence de version

`opencode --version` a retourné `1.18.23` sur la machine de travail. La [release primaire v1.18.23](https://github.com/anomalyco/opencode/releases/tag/v1.18.23) a été publiée le 25 août 2026 et pointe vers le commit `ef2880f`. Les commandes et flags ci-dessous ont aussi été vérifiés avec `--help` sur ce binaire local.

La documentation OpenCode est un site continu : certaines pages peuvent décrire une version postérieure à 1.18.23. Ce document distingue donc :

- **confirmé localement 1.18.23** : la commande/option apparaît dans l'aide locale ;
- **contrat officiel à revalider** : API ou comportement documenté, mais à tester dans un spike avant de le rendre obligatoire ;
- **non fourni** : aucune capacité native 1.18.23 confirmée.

Sources primaires : [CLI officiel](https://dev.opencode.ai/docs/cli/), [agents](https://opencode.ai/docs/agents/), [serveur HTTP/OpenAPI](https://dev.opencode.ai/docs/server/), [modèles](https://dev.opencode.ai/docs/models/), [GitHub](https://dev.opencode.ai/docs/github/).

## Inventaire utilisable

| Besoin | Capacité | Statut 1.18.23 | Usage recommandé |
|---|---|---:|---|
| Lister les modèles réellement accessibles | `opencode models [provider]`, `--verbose`, `--refresh` | Confirmé localement | Capturer un inventaire au début du run ; ne jamais figer une liste théorique dans la spec. |
| Lister les agents | `opencode agent list` | Confirmé localement | Vérifier que tous les rôles déclarés sont présents avant de démarrer une vague. |
| Appel non interactif | `opencode run ... --format json --agent ... --model ... --variant ...` | Confirmé localement | Mode CLI le plus simple pour un travail atomique et journalisé. |
| Réutiliser/forker une session | `opencode run --session`, `--continue`, `--fork` | Confirmé localement | Reprendre uniquement une unité de travail inachevée ; ne pas conserver tout le projet dans une session unique. |
| Export/import | `opencode export <sessionID> [--sanitize]`, `opencode import <file>` | Confirmé localement | Exporter après chaque checkpoint ; ne pas faire dépendre la reprise du stockage interne d'OpenCode seul. |
| Sous-agents | agents `mode: subagent`, permission `task` | Contrat officiel, à tester | Recherche/review parallèles, jamais merge ni push. |
| Serveur réutilisable | `opencode serve`, API OpenAPI à `/doc` | Confirmé CLI ; API à tester | Optionnel pour réduire le cold-start ; l'orchestrateur CLI reste le chemin de référence. |
| GitHub | `opencode github install/run`, action GitHub | Confirmé localement/documenté | À réserver aux workflows GitHub, pas au moteur local de boucle. |
| Worktrees | commande OpenCode dédiée | **Non fournie** | `git worktree` piloté par l'orchestrateur, puis OpenCode lancé avec ce worktree comme cwd. |

## Découverte et sélection de modèles

Avant toute vague, l'orchestrateur doit exécuter et archiver la sortie :

```bash
opencode models --verbose
opencode agent list
opencode --version
```

`opencode models` liste les modèles des providers configurés au format `provider/model`; `--refresh` recharge son cache, et `--verbose` ajoute notamment les métadonnées de coût. Les providers réellement visibles dépendent des credentials/configuration de la machine, donc l'orchestrateur doit construire son catalogue à l'exécution plutôt que supposer que Claude, Codex ou Gemini sont tous disponibles. [Source officielle CLI](https://dev.opencode.ai/docs/cli/#models).

Chaque rôle doit porter un modèle explicite (et éventuellement un variant), par exemple dans `.opencode/agents/*.md` ou `opencode.json`. OpenCode autorise `primary`, `subagent` et `all`; un sous-agent peut définir son propre modèle. Les options supplémentaires de l'agent sont passées au provider, donc les variants/efforts doivent être conservés dans les checkpoints. [Source officielle agents](https://opencode.ai/docs/agents/#mode), [modèles et variants](https://dev.opencode.ai/docs/models/#variants).

Politique recommandée :

| Rôle | Classe de modèle choisie dynamiquement | Droit |
|---|---|---|
| `orchestrator` | meilleur modèle de raisonnement/tool-use disponible | créer les worktrees, planifier, intégrer après gates |
| `implementer` | meilleur modèle code disponible | modifier **son** worktree, jamais `main` |
| `reviewer` | modèle de raisonnement distinct si disponible | lecture/tests uniquement |
| `researcher` | modèle rapide et fiable | lecture/notes uniquement |
| `test-fixer` | modèle code | correctifs bornés dans le worktree de la sous-spec |

Le mapping exact ne doit être décidé qu'après inventaire. Il doit être écrit dans `docs/checkpoints/<run>/model-allocation.md`, avec les raisons, coûts observés et fallback. Aucun agent ne choisit silencieusement un nouveau modèle pendant une tâche.

## Exécution non interactive et sessions

La commande de base, confirmée par l'aide 1.18.23, est :

```bash
opencode run --format json \
  --agent <agent-id> \
  --model <provider/model> \
  --variant <variant> \
  --title <checkpoint-id> \
  "<prompt atomique>"
```

`--format json` produit des événements bruts exploitables par l'orchestrateur; `--agent`, `--model`, `--variant`, `--title`, `--file`, `--auto`, `--session`, `--continue` et `--fork` sont exposés par l'aide locale. `--auto` est signalé comme dangereux : il ne doit pas être globalement activé. Les permissions doivent être déclarées sur chaque agent et les opérations sensibles (`git push`, publication, suppression, accès hors worktree) doivent rester refusées ou demander une approbation explicite. [Référence CLI officielle](https://dev.opencode.ai/docs/cli/#run), [permissions d'agents](https://opencode.ai/docs/agents/#permissions).

Pour chaque invocation, enregistrer dans un artefact de checkpoint : commande, version OpenCode, modèle+variant, agent, cwd/worktree, horodatages, code de sortie, session ID, chemin de log JSONL, diff Git et résultats des gates.

Reprise robuste :

1. L'agent termine une sous-étape ou échoue de manière visible.
2. L'orchestrateur exporte la session : `opencode export <session-id> --sanitize`.
3. Il écrit/actualise le checkpoint Markdown et commit l'état utile dans le worktree.
4. À la relance, il relit la sous-spec et le checkpoint ; il utilise `--session <id>` seulement si le contexte est nécessaire. `--fork` permet d'expérimenter sans modifier la branche de la session initiale.

OpenCode documente export JSON, import depuis fichier ou URL de partage et la reprise/fork de sessions. L'export ne remplace pas les preuves Git et les fichiers de checkpoint : la session peut être volumineuse, contenir des données sensibles et dépendre d'une implémentation interne. Toujours donner l'ID : sans lui `export` devient interactif. La session ne doit pas être partagée par défaut (`share: "disabled"`) : un journal d'implémentation n'a aucune raison d'être public. [Source officielle CLI](https://dev.opencode.ai/docs/cli/#export), [partage de sessions](https://opencode.ai/docs/share/).

Ne pas utiliser `--continue`/`-c` pour une boucle à worktrees : il reprend la « dernière session » globale, dont le lien au worktree n'est pas une garantie. Le projet OpenCode a documenté un mélange de sessions entre worktrees dans l'[issue #41562](https://github.com/anomalyco/opencode/issues/41562). La reprise automatisée doit donc utiliser exclusivement `--session "$SESSION_ID"`, un ID enregistré dans le checkpoint, et non parser une sortie textuelle.

## Agents, sous-agents et parallélisme sûr

Les agents configurés en `mode: subagent` sont invoqués par l'outil Task, et `permission.task` restreint les sous-agents qu'un agent peut lancer. Les règles sont ordonnées et la dernière règle correspondante gagne ; `deny` retire le sous-agent de la description de l'outil. [Source officielle](https://opencode.ai/docs/agents/#task-permissions).

Configuration cible (schématique) :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "orchestrator": {
      "mode": "primary",
      "permission": {
        "task": { "*": "deny", "researcher": "allow", "reviewer": "allow" }
      }
    },
    "implementer": { "mode": "primary" },
    "reviewer": {
      "mode": "subagent",
      "permission": { "edit": "deny", "bash": { "git diff*": "allow", "*": "ask" } }
    }
  }
}
```

Ne pas déléguer plusieurs rédacteurs dans le même worktree. Le parallélisme est par **sous-spec indépendante + worktree indépendant**. Un reviewer peut examiner plusieurs worktrees en lecture; un implémenteur n'écrit que dans celui qui lui a été attribué.

La profondeur de sous-agents doit rester à `1` au départ. La documentation indique qu'elle est configurable, mais plus de profondeur augmente fortement le risque de boucles opaques ; le seul agent qui orchestre les étapes suivantes doit être le primaire durable. [Configuration officielle](https://dev.opencode.ai/docs/config/#subagent-depth).

## Worktrees : responsabilité Git, pas OpenCode

L'aide d'OpenCode 1.18.23 ne liste aucune commande `worktree`. La CLI `run` accepte `--dir`; la documentation le définit comme le répertoire d'exécution (ou un chemin côté serveur avec `--attach`). L'orchestrateur doit tout de même démarrer le processus avec ce worktree comme `cwd`, puis fournir `--dir "$WORKTREE"` lors d'un appel attaché. Ce doublage rend le contexte explicite et évite toute ambiguïté.

Exemple de protocole à automatiser par l'orchestrateur (pas par les sous-agents) :

```bash
git fetch origin main
git worktree add ../open-websearch-mcp-<spec-id> -b impl/<spec-id> origin/main
# lancer opencode depuis ce worktree : opencode run --dir "$PWD" ...
# gates + review + commits
git worktree remove ../open-websearch-mcp-<spec-id>
```

Avant création, l'orchestrateur vérifie : worktree propre, branche inexistante, chemin exact sous un répertoire dédié, et `main` à jour. Après intégration, il vérifie que le worktree est propre puis le retire. Aucun `git reset --hard` ni suppression récursive ne fait partie du protocole.

## Boucle autonome recommandée

Le mot « ne s'arrête jamais » doit être traduit en une boucle **bornée et reprenable**, pas un processus infini sans garde-fou. L'orchestrateur répète jusqu'à ce que toutes les sous-specs soient `accepted`, ou qu'un état `blocked` soit étayé par une preuve reproductible.

```text
charger SPEC.md + ORCHESTRATION.md + dernier checkpoint
  → vérifier repo/main, catalogue modèles, outils, gates
  → choisir une sous-spec prête (dépendances satisfaites)
  → créer worktree isolé
  → agent de plan challenge les décisions locales
  → implémenteur réalise une tranche testable
  → gates automatiques
  → deux reviews indépendantes (spec + qualité/sécurité)
  → correctif borné si rejet, puis re-gates/reviews
  → commit checkpoint + session export + PR
  → CI GitHub
  → intégrer seulement quand les critères sont satisfaits
  → mettre à jour le checkpoint global et reprendre
```

Règles de terminaison :

- une sous-spec ne peut devenir `accepted` qu'avec ses critères d'acceptation, tests et deux reviews `pass`;
- après trois tentatives sans progrès mesurable, l'orchestrateur produit un `blocked.md` avec logs, hypothèses et options, puis passe aux sous-specs indépendantes ;
- « terminé » exige que le registre de traçabilité spec → code → tests → checkpoints soit complet, pas seulement que les tests verts ;
- aucune publication npm, création de repository distant, push ou merge ne doit être automatisée sans la configuration GitHub/npm explicitement autorisée dans la phase correspondante.

## Serveur HTTP : accélérateur optionnel

`opencode serve` démarre un serveur headless; la documentation indique une spécification OpenAPI à `/doc`, un health check, des routes de sessions, d'envoi synchrone/asynchrone, d'abort, de fork, de diff et d'événements SSE. [Serveur officiel](https://dev.opencode.ai/docs/server/).

Cela peut réduire le démarrage répété et donner un contrôleur plus précis : créer une session, poster `prompt_async`, suivre les événements SSE, puis lire messages/diff et aborter à échéance. Mais le contrat HTTP doit être vérifié par un spike **sur 1.18.23**, car les docs évoluent. Le CLI `opencode run --format json` reste le chemin de repli obligatoire. Ne jamais exposer le serveur au réseau : `127.0.0.1`, port éphémère, mot de passe si l'API est rendue accessible.

## GitHub, PR et CI

OpenCode fournit `opencode github install` et `opencode github run`; la documentation de l'action supporte entre autres `pull_request`, `schedule` et `workflow_dispatch`, et peut créer des branches/PR si les permissions GitHub adéquates sont données. En revanche, `opencode pr <number>` récupère/checkout une PR et ouvre OpenCode : ce n'est pas une commande de création ou de merge de PR. [Documentation GitHub officielle](https://dev.opencode.ai/docs/github/), [CLI `pr`](https://opencode.ai/docs/cli/#pr).

Pour ce projet, employer ces capacités seulement en complément :

- CI de PR ordinaire : tests, format, lint, type-aware lint, sécurité, benchmarks déterministes ; aucun agent autonome qui merge.
- Action OpenCode de review : optionnelle, lecture seule, commentaire de PR ; elle ne remplace pas les deux reviews locales définies par l'orchestration.
- Création/merge de PR : réalisée par l'orchestrateur via Git/GitHub CLI lorsque la phase GitHub sera explicitement activée. La documentation OpenCode ne remplace pas les protections de branche ni la review humaine demandée par GitHub.

Ne pas utiliser `@latest` pour l'action CI : épingler une version ou un SHA au moment d'activer le workflow de release. Les docs utilisent `@latest` comme exemple, mais cela ne satisfait pas l'exigence du projet de versions reproductibles.

## Spikes obligatoires avant d'en dépendre

1. **CLI JSON** : vérifier que `opencode run --format json` expose session ID, événements et code de sortie utilisables sans TUI.
2. **Sous-agents** : un orchestrateur primaire lance deux reviewers en parallèle, vérifie permissions, profondeur et récupération des résultats.
3. **Serveur** : `opencode serve` local, `/global/health`, `/doc`, création de session, `prompt_async`, SSE, abort, shutdown.
4. **Worktrees** : trois worktrees en parallèle, chacun lancé par `cwd`; vérifier qu'aucun fichier/commit ne fuit vers `main`.
5. **Reprise** : interrompre une tâche, exporter/sanitizer, reprendre depuis checkpoint + session ID, et confirmer que la décision est la même ou explicitement challengée.
6. **GitHub CI** : workflow PR sans secrets de publication ; valider permissions minimales et statut obligatoire avant tout merge.
7. **Préflight de version** : exiger `test "$(opencode --version)" = "1.18.23"`, archiver `opencode run --help` et le catalogue `opencode models --refresh --verbose` dans le checkpoint de run.

## Limites à ne pas masquer

- La disponibilité, le coût, les limites de taux et les capacités de chaque modèle viennent des providers configurés, pas d'OpenCode seul.
- OpenCode fournit des sous-agents, mais pas une preuve qu'un modèle choisira toujours de déléguer correctement. L'orchestrateur doit vérifier les artefacts, jamais croire un message de fin.
- La documentation du serveur est évolutive ; la compatibilité des endpoints doit être testée contre le binaire 1.18.23 retenu.
- Aucun plan ne peut légitimement promettre une boucle infinie : des budgets de tentatives, timeouts, annulations et états `blocked` sont nécessaires pour éviter une consommation sans progrès.
- Le GitHub agent est puissant et peut créer branches/PR selon ses permissions. Il doit rester incapable de publier npm, changer les protections de branche ou merger `main` automatiquement.

## Recommandation finale

Construire le futur dossier `.opencode/` autour d'un orchestrateur durable, mais conserver le **workflow de vérité dans les specs, checkpoints et Git**. OpenCode choisit/exécute les agents et modèles ; Git worktrees isole les écritures ; la CI et les reviewers valident ; l'orchestrateur ne progresse qu'après artefacts vérifiables. Cette séparation permet d'utiliser les nombreux modèles disponibles sans transformer leurs sorties en autorité non contrôlée.
