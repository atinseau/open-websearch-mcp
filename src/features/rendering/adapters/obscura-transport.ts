export interface ObscuraArchiveEntry {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/** Injectable network and archive boundary; production never uses a release alias. */
export interface ObscuraTransport {
  download(url: URL, destination: string, maximumBytes: number): Promise<void>;
  list(archive: string): Promise<readonly ObscuraArchiveEntry[]>;
  extract(archive: string, destination: string): Promise<void>;
}

export const defaultObscuraTransport: ObscuraTransport = {
  download,
  list: listZip,
  extract: extractZip,
};

async function download(url: URL, destination: string, maximumBytes: number): Promise<void> {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok || !response.body) throw new Error("obscura_download_failed");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isSafeInteger(declared) || declared > maximumBytes)
    throw new Error("obscura_download_too_large");
  const sink = Bun.file(destination).writer();
  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > maximumBytes) throw new Error("obscura_download_too_large");
      await sink.write(next.value);
    }
  } finally {
    await reader.cancel();
    await sink.end();
  }
}

async function listZip(archive: string): Promise<readonly ObscuraArchiveEntry[]> {
  const result = Bun.spawnSync(["/usr/bin/zipinfo", "-1", archive]);
  if (result.exitCode !== 0) throw new Error("obscura_archive_inspection_failed");
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, kind: path.endsWith("/") ? "directory" : "file" }));
}

async function extractZip(archive: string, destination: string): Promise<void> {
  const result = Bun.spawnSync(["/usr/bin/unzip", "-q", archive, "-d", destination]);
  if (result.exitCode !== 0) throw new Error("obscura_archive_extraction_failed");
}
