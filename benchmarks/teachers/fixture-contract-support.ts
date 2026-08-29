import { array, record, requiredString, webUrl, type JsonRecord } from "./contract-json.ts";

/** The source URLs and passages a teacher run actually observed. */
export type EvidenceSupport = { urls: Set<string>; passagesByUrl: Map<string, string[]> };

export function evidenceSupport(value: unknown): EvidenceSupport {
  const evidence = record(value, "fixture evidence");
  const urls = new Set<string>();
  const passagesByUrl = new Map<string, string[]>();
  for (const [runIndex, runValue] of array(evidence.runs, "fixture evidence runs").entries()) {
    const run = record(runValue, `fixture evidence runs[${runIndex}]`);
    for (const field of ["opened_urls", "cited_urls"] as const) {
      for (const [index, urlValue] of array(
        run[field] ?? [],
        `fixture evidence runs[${runIndex}].${field}`,
        true,
      ).entries()) {
        urls.add(webUrl(urlValue, `fixture evidence runs[${runIndex}].${field}[${index}]`));
      }
    }
    for (const [sourceIndex, sourceValue] of array(
      run.selected_sources ?? [],
      `fixture evidence runs[${runIndex}].selected_sources`,
      true,
    ).entries()) {
      const source = record(
        sourceValue,
        `fixture evidence runs[${runIndex}].selected_sources[${sourceIndex}]`,
      );
      urls.add(
        webUrl(
          source.url,
          `fixture evidence runs[${runIndex}].selected_sources[${sourceIndex}].url`,
        ),
      );
    }
    for (const [passageIndex, passageValue] of array(
      run.evidence_passages ?? [],
      `fixture evidence runs[${runIndex}].evidence_passages`,
      true,
    ).entries()) {
      const passage = record(
        passageValue,
        `fixture evidence runs[${runIndex}].evidence_passages[${passageIndex}]`,
      );
      const url = webUrl(passage.url, "fixture evidence passage URL");
      urls.add(url);
      const texts = passagesByUrl.get(url) ?? [];
      texts.push(requiredString(passage.text, "fixture evidence passage text"));
      passagesByUrl.set(url, texts);
    }
  }
  return { urls, passagesByUrl };
}

export function assertClaimSupported(
  claim: JsonRecord,
  support: EvidenceSupport,
  id: string,
): void {
  for (const [sourceIndex, sourceValue] of array(claim.sources, `claim ${id} sources`).entries()) {
    const source = record(sourceValue, `claim ${id} sources[${sourceIndex}]`);
    for (const url of [
      webUrl(source.url, `claim ${id} sources[${sourceIndex}].url`),
      ...array(
        source.equivalent_urls,
        `claim ${id} sources[${sourceIndex}].equivalent_urls`,
        true,
      ).map((value, index) =>
        webUrl(value, `claim ${id} sources[${sourceIndex}].equivalent_urls[${index}]`),
      ),
    ]) {
      if (!support.urls.has(url)) {
        throw new Error(`claim ${id} source is absent from teacher-run evidence: ${url}`);
      }
    }
  }
  for (const passageValue of array(
    claim.evidence_passages,
    `claim ${id} evidence_passages`,
    true,
  )) {
    if (!passageSupported(passageValue, support)) {
      throw new Error(`claim ${id} passage is absent from teacher-run evidence`);
    }
  }
}

export function passageSupported(passageValue: unknown, support: EvidenceSupport): boolean {
  const passage = record(passageValue, "claim evidence passage");
  const url = webUrl(passage.url, "claim evidence passage URL");
  const text = requiredString(passage.text, "claim evidence passage text");
  return (support.passagesByUrl.get(url) ?? []).some((observed) => observed.includes(text));
}
