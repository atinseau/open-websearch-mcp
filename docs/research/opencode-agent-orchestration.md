# OpenCode 1.18.23 - minimal implementation loop

Date de vérification : 25 août 2026.

## Conclusion

OpenCode fournit déjà le modèle puissant, les sous-agents, les sessions, le mode
non interactif, les outils et l’auto-compaction nécessaires. Le dépôt doit
ajouter seulement une petite boucle de contrôle pour choisir la prochaine tâche,
persister une trace et relancer proprement après une interruption.

Il n’est pas nécessaire de construire un ordonnanceur multi-modèles, une base
de sessions exportées, un système de capacités, ou une plateforme générique.

## Capacités utiles

| Besoin | Mécanisme |
| --- | --- |
| Contrôleur puissant | modèle choisi par l’utilisateur ou la configuration OpenCode |
| Exécution scriptable | `opencode run --format json` avec cwd, modèle et session explicites |
| Reprise | session explicite lorsque utile, sinon nouvelle session alimentée par la dernière trace |
| Compaction | auto-compaction native OpenCode |
| Travail borné | sous-agent ou session fraîche pour implémentation/revue |
| Isolation Git | `git worktree` sous `.worktree/` |
| Vérité durable | spec, Git, tests, `state.toml` et traces Markdown |

Sources primaires : [CLI officiel](https://dev.opencode.ai/docs/cli/),
[agents](https://opencode.ai/docs/agents/),
[modèles](https://dev.opencode.ai/docs/models/).

## Boucle Recommandée

```text
lire SPEC + état + dernière trace
  -> choisir une tâche prête
  -> créer/reprendre .worktree/<task>-a<n>
  -> appeler OpenCode avec le modèle contrôleur
  -> implémenter une étape bornée
  -> exécuter les tests
  -> faire une revue fraîche si le changement est substantiel
  -> écrire la trace de l’étape
  -> intégrer et nettoyer le worktree
  -> recommencer
```

Le contrôleur travaille sur une seule tâche d’implémentation à la fois. Les
sous-agents peuvent paralléliser des lectures ou vérifications sans créer
plusieurs rédacteurs ni plusieurs worktrees actifs.

## Trace De Reprise

Chaque étape écrit
`docs/orchestration/runs/<task>/NNNN-<step>.md` avec :

- modèle, variant, session, worktree, branche et SHA ;
- objectif et travail terminé ;
- fichiers modifiés ;
- commandes et résultats ;
- décisions, findings et blocages ;
- prochaine action exacte.

Après compaction ou redémarrage, le modèle relit cette trace. L’export complet
d’une session reste un outil de diagnostic optionnel, jamais une obligation.

## Worktrees

OpenCode ne gère pas les worktrees à la place de Git. Tous les worktrees du
projet vivent sous :

```text
open-websearch-mcp/.worktree/
```

Le contrôleur crée le worktree avant l’appel OpenCode, utilise ce chemin comme
cwd, puis le retire avec `git worktree remove` après intégration ou abandon
explicitement tracé.

## Garde-fous Suffisants

- tests réels avant progression ;
- revue fraîche pour les changements substantiels ;
- timeout et nombre borné de répétitions sans nouvelle approche ;
- aucune publication ou mutation GitHub sensible sans demande explicite ;
- aucune déclaration `complete` avec exigence obligatoire ouverte ;
- un échec de test ou une compaction produit une nouvelle étape, pas un succès.

## Non-objectifs

- benchmarker et classer automatiquement tous les modèles ;
- imposer plusieurs fournisseurs ou familles de modèles ;
- exporter et signer chaque session ;
- gérer quatre worktrees d’implémentation en parallèle ;
- créer un sandbox, broker, relay ou protocole cryptographique ;
- transformer BOOT-002 en produit réutilisable pour d’autres dépôts.

La complexité ne doit être ajoutée qu’après un besoin observé dans cette boucle
simple.
