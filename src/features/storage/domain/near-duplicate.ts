const signatureSize = 64;
const minContentTokens = 3;

export interface NearDuplicateMatch {
  readonly canonicalUrl: URL;
  readonly similarity: number;
}

/** A fixed MinHash signature gives deterministic lexical similarity estimates. */
export function nearDuplicateSignature(content: string): readonly number[] | undefined {
  const shingles = wordShingles(content);
  if (shingles.length === 0) return undefined;
  return Array.from({ length: signatureSize }, (_, seed) => minimumHash(shingles, seed));
}

export function findNearDuplicate(
  content: string,
  candidates: readonly { readonly canonicalUrl: URL; readonly signature: readonly number[] }[],
  threshold: number,
): NearDuplicateMatch | undefined {
  const signature = nearDuplicateSignature(content);
  if (!signature || threshold < 0 || threshold > 1) return undefined;
  return candidates
    .map((candidate) => ({
      canonicalUrl: candidate.canonicalUrl,
      similarity: similarity(signature, candidate.signature),
    }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort(compareMatches)[0];
}

export function similarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== signatureSize || right.length !== signatureSize) return 0;
  return left.filter((value, index) => value === right[index]).length / signatureSize;
}

function wordShingles(content: string): readonly string[] {
  const words = content.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < minContentTokens) return [];
  return Array.from({ length: words.length - minContentTokens + 1 }, (_, index) =>
    words.slice(index, index + minContentTokens).join(" "),
  );
}

function minimumHash(shingles: readonly string[], seed: number): number {
  return shingles.reduce((minimum, shingle) => Math.min(minimum, hash(shingle, seed)), 0xffffffff);
}

function hash(value: string, seed: number): number {
  let result = (2166136261 ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  for (const character of value) {
    result ^= character.codePointAt(0)!;
    result = Math.imul(result, 16777619) >>> 0;
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b) >>> 0;
  return (result ^ (result >>> 13)) >>> 0;
}

function compareMatches(left: NearDuplicateMatch, right: NearDuplicateMatch): number {
  if (right.similarity !== left.similarity) return right.similarity - left.similarity;
  return left.canonicalUrl.href < right.canonicalUrl.href ? -1 : 1;
}
