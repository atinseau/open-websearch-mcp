import type { PathLike } from "bun";
import type { BunFile } from "bun";

export function tooComplex(first: string, second: string): string {
  if (first) {
    if (second) return first;
  }
  const value = first;
  return value;
}
