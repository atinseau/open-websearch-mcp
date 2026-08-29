import { requiredString } from "./contract-json-validation.ts";

/** Matches an absolute HTTP(S) URL, stopping at common trailing delimiters. */
export const webUrlPattern = /https?:\/\/[^\s\]}>,'"`。、）]+/g;

export function extractedWebUrls(value: string): string[] {
  return [...value.matchAll(webUrlPattern)]
    .map((match) => trimUrlDelimiters(match[0], value.slice(0, match.index)))
    .filter((candidate) => {
      try {
        const parsed = new URL(candidate);
        return (
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          parsed.hostname.length > 0 &&
          !parsed.hostname.includes("…")
        );
      } catch {
        return false;
      }
    });
}

function trimUrlDelimiters(value: string, prefix: string): string {
  let candidate = cutAtUnmatchedClose(value, "(", ")");
  for (const marker of ["**", "~~", "*", "_"]) {
    if (prefix.endsWith(marker) && candidate.endsWith(marker)) {
      candidate = candidate.slice(0, -marker.length);
      break;
    }
  }
  let previous: string;
  do {
    previous = candidate;
    candidate = candidate.replace(/[.;:!?,]+$/g, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ] as const) {
      while (candidate.endsWith(close) && count(candidate, close) > count(candidate, open)) {
        candidate = candidate.slice(0, -1);
      }
    }
  } while (candidate !== previous);
  return candidate;
}

function cutAtUnmatchedClose(value: string, open: string, close: string): string {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === open) depth += 1;
    if (value[index] !== close) continue;
    if (depth === 0) return value.slice(0, index);
    depth -= 1;
  }
  return value;
}

function count(value: string, character: string): number {
  return value.split(character).length - 1;
}

export function webUrl(value: unknown, label: string): string {
  const candidate = requiredString(value, label);
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.hostname.length === 0 ||
      parsed.hostname.includes("…")
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL`);
  }
  return candidate;
}
