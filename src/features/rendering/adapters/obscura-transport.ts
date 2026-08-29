export interface ObscuraArchiveEntry {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/** Injectable network and archive boundary; production never uses a release alias. */
export interface ObscuraTransport {
  download(url: URL, destination: string, maximumBytes: number): Promise<void>;
  list(archive: string): Promise<readonly ObscuraArchiveEntry[]>;
  /** Must reject before extraction when archive members exceed this decoded-byte limit. */
  extract(archive: string, destination: string, maximumExtractedBytes: number): Promise<void>;
}

export const defaultObscuraTransport: ObscuraTransport = {
  download,
  list,
  extract,
};

async function download(url: URL, destination: string, maximumBytes: number): Promise<void> {
  const response = await fetchRelease(url);
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

async function fetchRelease(initial: URL): Promise<Response> {
  let url = initial;
  for (let redirects = 0; redirects <= 5; redirects++) {
    assertPublic(url);
    const response = await fetch(url, { redirect: "manual" });
    if (!isRedirect(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 5) throw new Error("obscura_download_redirect_limit");
    url = new URL(location, url);
  }
  throw new Error("obscura_download_redirect_limit");
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

async function list(archive: string): Promise<readonly ObscuraArchiveEntry[]> {
  return isTarGz(archive) ? listTar(archive) : listZip(archive);
}

async function listTar(archive: string): Promise<readonly ObscuraArchiveEntry[]> {
  const result = Bun.spawnSync(["/usr/bin/tar", "-tzf", archive]);
  if (result.exitCode !== 0) throw new Error("obscura_archive_inspection_failed");
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, kind: path.endsWith("/") ? "directory" : "file" }));
}

async function extractZip(
  archive: string,
  destination: string,
  maximumExtractedBytes: number,
): Promise<void> {
  const listing = Bun.spawnSync(["/usr/bin/unzip", "-Z", "-l", archive]);
  if (listing.exitCode !== 0) throw new Error("obscura_archive_inspection_failed");
  const total = decodedZipBytes(new TextDecoder().decode(listing.stdout));
  if (total > maximumExtractedBytes) throw new Error("obscura_extraction_too_large");
  const result = Bun.spawnSync(["/usr/bin/unzip", "-q", archive, "-d", destination]);
  if (result.exitCode !== 0) throw new Error("obscura_archive_extraction_failed");
}

async function extract(
  archive: string,
  destination: string,
  maximumExtractedBytes: number,
): Promise<void> {
  if (isTarGz(archive)) return extractTar(archive, destination, maximumExtractedBytes);
  return extractZip(archive, destination, maximumExtractedBytes);
}

async function extractTar(
  archive: string,
  destination: string,
  maximumExtractedBytes: number,
): Promise<void> {
  await ensureTarBound(archive, maximumExtractedBytes);
  const result = Bun.spawnSync(["/usr/bin/tar", "-xzf", archive, "-C", destination]);
  if (result.exitCode !== 0) throw new Error("obscura_archive_extraction_failed");
}

async function ensureTarBound(archive: string, limit: number): Promise<void> {
  const process = Bun.spawn(["/usr/bin/gzip", "-dc", archive], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const reader = process.stdout.getReader();
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        process.kill();
        throw new Error("obscura_extraction_too_large");
      }
    }
  } finally {
    reader.releaseLock();
  }
  if ((await process.exited) !== 0) throw new Error("obscura_archive_inspection_failed");
}

function decodedZipBytes(listing: string): number {
  let total = 0;
  for (const line of listing.split("\n")) {
    const match = /^\s*(\d+)\s+/u.exec(line);
    if (!match) continue;
    total += Number(match[1]);
    if (!Number.isSafeInteger(total)) throw new Error("obscura_archive_size_invalid");
  }
  return total;
}

function assertPublic(url: URL): void {
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
    throw new Error("obscura_download_non_public_redirect");
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isTarGz(archive: string): boolean {
  return archive.endsWith(".tar.gz") || archive.endsWith(".tgz");
}
