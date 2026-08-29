# VER-002 — completion des harnais installés

Task: `VER-002`  
Attempt: `arch-bench-a1`  
Branch/worktree: `agent/arch-bench-a1` / `.worktree/arch-bench`

## But et résultat

Mesurer Gemini CLI et OpenCode nouvellement installés contre le serveur stdio
réel du worktree `arch-bench`, sans authentifier de compte ni saisir de
credentials.

- Gemini CLI `0.57.0` a accepté l'enregistrement stdio, mais `mcp list` l'a
  affiché désactivé dans le worktree non fiable. Le tour non interactif a choisi
  `google_web_search`, pas `web_search`, puis a échoué sur `429
  RESOURCE_EXHAUSTED`. Aucun appel au produit n'est prouvé.
- OpenCode `1.18.25` a accepté l'enregistrement et affiché le serveur comme
  `connected`, preuve partielle que le serveur stdio a été lancé et connecté.
  Son tour non interactif s'est arrêté avant la sélection d'outil avec
  `ProviderAuthError`: la clé Google Generative AI est absente. Aucun appel à
  `web_search` n'est prouvé.
- Claude Code reste `UNAVAILABLE`: ADR-0006 interdit toute réauthentification
  par un agent.

La matrice mise à jour est
`benchmarks/harnesses/2026-08-29-mcp-compatibility-matrix.md`; elle contient
les commandes et sorties brutes. Les deux résultats sont `UNAVAILABLE`, et non
des PASS, car aucun des deux harnais n'a complété l'appel réel demandé.

## Vérification

La gate complète, exécutée hors sandbox, a réussi :

```text
bun run check
```

Le rerun de la suite pour conserver son récapitulatif a produit `234 pass`,
`1 skip`, `0 fail`, et `1298 expect() calls`.

## Nettoyage et contraintes

Gemini a créé `.gemini/settings.json` dans le worktree malgré le `HOME`
temporaire. Sa commande `mcp remove --scope project` a répondu exactement
`Server "open-websearch-ver002" not found in project settings.`; le fichier
généré a donc été supprimé immédiatement. La configuration HOME/XDG complète
d'OpenCode était sous `/private/tmp/open-websearch-ver002-opencode` et a été
supprimée. Aucun compte n'a été authentifié et aucun credential n'a été saisi.

## Reste bloqué

Il reste à obtenir, avec l'autorité humaine appropriée, un tour Gemini et un
tour OpenCode pouvant sélectionner `web_search` et recevoir son enveloppe MCP
structurée. Une connexion OpenCode avec un fournisseur autorisé est requise;
Gemini doit disposer d'un quota fournisseur utilisable et permettre le serveur
MCP dans le contexte de probe. `blocked/captcha` reçu après un tel appel serait
un PASS du harnais, conformément à SEARCH-012/PROD-002.
