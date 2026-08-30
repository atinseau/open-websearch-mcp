import { expect, test } from "bun:test";

import { gradeCase } from "../grader/grader.ts";
import { selectEvidencePassage } from "./passage-selection.ts";

const claim = {
  id: "c1",
  required_concepts: ["group-structure", "user-agent"],
  acceptable_patterns: ["groups? start(?:s)? with one or more user-agent lines"],
  sources: [{ url: "https://spec.test/robots", equivalent_urls: [] }],
  evidence_passages: [],
  weight: 1,
};

const supporting = [
  "Robots Exclusion Protocol",
  "",
  "A robots.txt file is a set of rules. Groups start with one or more user-agent lines,",
  "and the group-structure continues until the next user-agent line.",
  "",
  "Unrelated trailing section about caching.",
].join("\n");

test("a page carrying the claim's concepts and pattern yields a passage quoted from it", () => {
  const selected = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: supporting,
  });

  expect(selected.passage).toBeDefined();
  // The grader matches by substring, so a passage that is not literally present
  // in the page would score as a miss no matter how faithful its wording.
  expect(supporting).toContain(selected.passage?.text ?? "\u0000");
  expect(selected.passage?.url).toBe("https://spec.test/robots");
});

test("a page missing a required concept yields no passage and says which", () => {
  const withoutConcept = supporting.replaceAll("group-structure", "layout");

  const selected = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: withoutConcept,
  });

  expect(selected.passage).toBeUndefined();
  expect(selected.reason).toContain("group-structure");
});

test("a page matching no acceptable pattern yields no passage and says so", () => {
  const withoutPattern = supporting.replaceAll(
    "Groups start with one or more user-agent lines",
    "Rules are grouped by user-agent",
  );

  const selected = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: withoutPattern,
  });

  expect(selected.passage).toBeUndefined();
  expect(selected.reason).toContain("pattern");
});

test("selection is deterministic for the same claim and content", () => {
  const first = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: supporting,
  });
  const second = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: supporting,
  });

  expect(first).toEqual(second);
});

test("the passage is a bounded portion, not the whole page", () => {
  // CONTEXT.md defines an evidence passage as *bounded*. Returning the entire
  // page would satisfy the grader's substring test while proving nothing about
  // extraction: every result containing the page would match trivially.
  const padding = Array.from({ length: 40 }, (_, index) => `Filler paragraph ${index}.`).join(
    "\n\n",
  );
  const page = `${padding}\n\n${supporting}\n\n${padding}`;

  const selected = selectEvidencePassage(claim, { url: "https://spec.test/robots", content: page });

  expect(selected.passage).toBeDefined();
  const text = selected.passage?.text ?? "";
  expect(page).toContain(text);
  expect(text.length).toBeLessThan(page.length / 2);
  // It still has to carry what makes the claim true.
  expect(text.toLowerCase()).toContain("group-structure");
  expect(text.toLowerCase()).toContain("user-agent");
});

test("the capture path stays independent of the product", async () => {
  // A passage produced by the product could not honestly score the product.
  // Independence has to be structural, so assert it on the source itself
  // rather than trusting a convention someone can quietly break.
  const source = await Bun.file(new URL("passage-selection.ts", import.meta.url)).text();

  // Read the declarations rather than grepping for names: a string search is
  // satisfied by any spelling that avoids the literal, so it would bless an
  // import assembled at runtime. What matters is what this module can reach.
  const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((match) => match[1]);
  const dynamic = [...source.matchAll(/\bimport\s*\(/gu)];

  expect(imports).toBeEmpty();
  expect(dynamic).toBeEmpty();
  expect(source).not.toContain("require(");
});

test("a selected passage makes the grader's extraction component measurable", () => {
  // The point of this module is to feed gradeCase. Proving the passage satisfies
  // the grader — rather than merely looking plausible — is what closes the loop
  // that ADR-0010 left open.
  const selected = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: supporting,
  });
  const passage = selected.passage;
  expect(passage).toBeDefined();
  if (!passage) return;

  const score = gradeCase(
    {
      case_id: "capture-check",
      claims: [
        {
          id: claim.id,
          required_concepts: [...claim.required_concepts],
          acceptable_patterns: [...claim.acceptable_patterns],
          sources: [{ url: "https://spec.test/robots", equivalent_urls: [] }],
          evidence_passages: [passage],
          weight: 1,
        },
      ],
    },
    {
      case_id: "capture-check",
      results: [{ url: "https://spec.test/robots", text: supporting, token_count: 10 }],
    },
  );

  expect(score.components.extraction).not.toBe("unmeasurable");
  expect(score.total).not.toBe("unmeasurable");
});

test("a long page is selected from without a runaway search", () => {
  // The first implementation compared every start against every end, which cost
  // roughly the cube of the paragraph count: a 3000-paragraph page did not
  // finish in 25 seconds. Real specification pages reach that length, so the
  // search has to stay proportional to the page.
  const long = [
    ...Array.from({ length: 3000 }, (_, index) => `Paragraph ${index} of filler text.`),
    "Groups start with one or more user-agent lines, and the group-structure follows.",
  ].join("\n\n");

  const started = Date.now();
  const selected = selectEvidencePassage(claim, { url: "https://spec.test/robots", content: long });
  const elapsed = Date.now() - started;

  expect(selected.passage?.text).toBe(
    "Groups start with one or more user-agent lines, and the group-structure follows.",
  );
  expect(elapsed).toBeLessThan(5_000);
});

test("selection tolerates empty, whitespace-only and CRLF-separated pages", () => {
  expect(
    selectEvidencePassage(claim, { url: "https://spec.test/robots", content: "" }).passage,
  ).toBeUndefined();
  expect(
    selectEvidencePassage(claim, { url: "https://spec.test/robots", content: "   \n\n  " }).passage,
  ).toBeUndefined();

  const crlf = supporting.replaceAll("\n", "\r\n");
  const selected = selectEvidencePassage(claim, {
    url: "https://spec.test/robots",
    content: crlf,
  });
  expect(selected.passage).toBeDefined();
  expect(crlf).toContain(selected.passage?.text ?? "\u0000");
});

test("a passage is quoted verbatim whatever separates the page's paragraphs", () => {
  // The grader matches by substring. Rebuilding a span from its paragraphs with
  // a canonical separator silently rewrote pages using \r\n or a blank line
  // holding spaces, so the passage no longer appeared in the page it came from
  // and the extraction score collapsed to zero on pages that did support the
  // claim. Spans are therefore cut from the page, never reassembled.
  const spanning = {
    id: "c2",
    required_concepts: ["alpha", "beta"],
    acceptable_patterns: ["alpha[\\s\\S]*beta"],
  };

  for (const separator of ["\n\n", "\r\n\r\n", "\n   \n", "\n\n\n"]) {
    const page = ["Noise first.", "Alpha paragraph.", "Beta paragraph.", "Noise last."].join(
      separator,
    );
    const selected = selectEvidencePassage(spanning, { url: "https://spec.test/p", content: page });
    const text = selected.passage?.text ?? "\u0000";

    expect(page).toContain(text);
    expect(text.length).toBeLessThan(page.length);
    expect(text).toContain("Alpha paragraph.");
    expect(text).toContain("Beta paragraph.");
  }
});
