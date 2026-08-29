# Initial development run failure (retained)

This was a probe-program defect, not a Bun.WebView or Obscura incompatibility.
It is retained so the successful run is not represented as the only attempt.

Command:

```sh
bun spikes/webview-obscura/probe.ts docs/spikes/SPK-002/probe-result.json
```

Observed final error from the first implementation revision:

```text
TypeError: Bun.exit is not a function. (In 'Bun.exit(exitCode)', 'Bun.exit' is undefined)
```

The same run also used an overly whitespace-sensitive assertion for the local
fixture, despite the rendered DOM, three links, and `DOM.getDocument` having
already succeeded. The corrected probe removes `Bun.exit`, tests the expected
rendered content by inclusion, and was rerun successfully. No compatibility
conclusion is based on this failed development revision.
