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

  async get(reference: BlobReference): Promise<Uint8Array> {
    const bytes = new Uint8Array(await Bun.file(reference.path).arrayBuffer());
    if (bytes.byteLength !== reference.byteLength || (await sha256(bytes)) !== reference.digest) {
      throw new BlobIntegrityError(reference.path);
    }
    return bytes;
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
