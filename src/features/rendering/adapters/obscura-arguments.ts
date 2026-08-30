/**
 * Builds the `obscura serve` command line.
 *
 * Extracted so the flags that carry a requirement can be asserted without
 * spawning a browser: SEARCH-003's persistent Google profile, and the stealth
 * mode ADR-0014 records as already necessary.
 */
export function obscuraServeArguments(options: {
  readonly host: string;
  readonly port: number;
  /** Persistent profile directory; omitted keeps the store ephemeral. */
  readonly storageDirectory?: string | undefined;
  readonly allowPrivateNetwork?: boolean | undefined;
}): string[] {
  return [
    "serve",
    "--host",
    options.host,
    "--port",
    `${options.port}`,
    "--stealth",
    ...(options.storageDirectory ? ["--storage-dir", options.storageDirectory] : []),
    ...(options.allowPrivateNetwork ? ["--allow-private-network"] : []),
  ];
}
