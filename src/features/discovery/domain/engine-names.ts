/** The search engines discovery knows how to read (ADR-0014). */
export const engineNames = ["google", "duckduckgo", "bing"] as const;
export type EngineName = (typeof engineNames)[number];
