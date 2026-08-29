import type { BlobReference } from "../domain/types.ts";
import type { StorageBlobs } from "./storage.ts";

export const DOWNLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

/** Injectable network boundary: callers provide the security-validated transport. */
export interface DownloadTransport {
  fetch(url: URL, init: RequestInit): Promise<Response>;
}

export interface DownloadBudget {
  readonly limit: number;
  readonly used: number;
  consume(bytes: number): void;
}

export interface DownloadInput {
  readonly url: URL;
  readonly policy: PublicUrlPolicy;
  readonly transport: DownloadTransport;
  readonly blobs: StorageBlobs;
  readonly budget: DownloadBudget;
  readonly signal?: AbortSignal;
}

export interface DownloadedDocument {
  readonly response: Response;
  readonly body: BlobReference;
}

export class DownloadLimitError extends Error {
  constructor(limit: number) {
    super(`Target network budget exceeds ${limit} bytes`);
  }
}

export function createDownloadBudget(limit = DOWNLOAD_LIMIT_BYTES): DownloadBudget {
  return new AggregateBudget(limit);
}

export async function downloadDocument(input: DownloadInput): Promise<DownloadedDocument> {
  const assessment = input.policy.assess(input.url);
  if (!assessment.allowed)
    throw new Error(`Download URL rejected: ${assessment.reason ?? "policy"}`);
  const response = await input.transport.fetch(input.url, {
    redirect: "manual",
    signal: input.signal,
  });
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > remaining(input.budget)) throw new DownloadLimitError(input.budget.limit);
  if (response.body === null) throw new Error("Download response has no body");
  const body = await input.blobs.putStream(response.body, remaining(input.budget), (bytes) => {
    input.budget.consume(bytes);
  });
  return { response, body };
}

class AggregateBudget implements DownloadBudget {
  used = 0;

  constructor(readonly limit: number) {}

  consume(bytes: number): void {
    if (bytes > this.limit - this.used) throw new DownloadLimitError(this.limit);
    this.used += bytes;
  }
}

function remaining(budget: DownloadBudget): number {
  return budget.limit - budget.used;
}
import type { PublicUrlPolicy } from "@/features/security";
