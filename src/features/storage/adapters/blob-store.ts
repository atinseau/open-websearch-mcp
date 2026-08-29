import type { BlobReference } from "../domain/types.ts";

const encoder = new TextEncoder();

export class BlobIntegrityError extends Error {
  constructor(path: string) {
    super(`Cache blob integrity verification failed: ${path}`);
  }
}

export class BlobStore {
  constructor(private readonly root: string) {}

  async put(body: Uint8Array | string): Promise<BlobReference> {
    const bytes = typeof body === "string" ? encoder.encode(body) : body;
    const digest = await sha256(bytes);
    const path = `${this.root}/${digest}`;
    await Bun.write(path, bytes);
    return { digest, byteLength: bytes.byteLength, path };
  }

  async putStream(
    body: ReadableStream<Uint8Array>,
    limit: number,
    observe: (bytes: number) => void,
  ): Promise<BlobReference> {
    const temporary = `${this.root}/.${crypto.randomUUID()}.tmp`;
    const sink = Bun.file(temporary).writer();
    const hasher = new Bun.CryptoHasher("sha256");
    const reader = body.getReader();
    let byteLength = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > limit) throw new BlobLimitError(limit);
        observe(value.byteLength);
        hasher.update(value);
        await sink.write(value);
      }
      await sink.end();
      const digest = hasher.digest("hex");
      const path = `${this.root}/${digest}`;
      if (await Bun.file(path).exists()) await Bun.file(temporary).delete();
      else renameAtomically(temporary, path);
      return { digest, byteLength, path };
    } catch (error) {
      await sink.end();
      if (await Bun.file(temporary).exists()) await Bun.file(temporary).delete();
      await reader.cancel(error);
      throw error;
    }
  }

  async get(reference: BlobReference): Promise<Uint8Array> {
    const bytes = new Uint8Array(await Bun.file(reference.path).arrayBuffer());
    if (bytes.byteLength !== reference.byteLength || (await sha256(bytes)) !== reference.digest) {
      throw new BlobIntegrityError(reference.path);
    }
    return bytes;
  }
}

function renameAtomically(from: string, to: string): void {
  const result = Bun.spawnSync(["/bin/mv", from, to]);
  if (result.exitCode !== 0) throw new Error("Unable to atomically persist cache blob");
}

export class BlobLimitError extends Error {
  constructor(limit: number) {
    super(`Body exceeds ${limit} byte limit`);
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
