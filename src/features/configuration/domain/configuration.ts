import { z } from "zod";

export const schemaVersion = 1;

const positive = z.number().positive();
const fraction = z.number().min(0).max(1);

/**
 * The engines discovery may consult, in order (ADR-0014). A misconfiguration
 * fails at load with a named reason rather than at search time, when a shorter
 * list would silently look like an engine that simply never answered.
 */
export const engineNames = ["google", "duckduckgo", "bing"] as const;
const engineSchema = z.enum(engineNames, {
  error: (issue) =>
    `search.engines names unknown engine ${JSON.stringify(issue.input)}; expected one of ${engineNames.join(", ")}`,
});
const enginesSchema = z
  .array(engineSchema)
  .min(1, "search.engines must name at least one engine")
  .refine((engines) => new Set(engines).size === engines.length, {
    message: "search.engines must not list a duplicate engine",
  });

const controllerSchema = z
  .object({
    window_completions: positive,
    window_min_ms: positive,
    healthy_windows_before_growth: positive,
    growth_step: positive,
    minimum_concurrency: positive,
    error_decrease_threshold: fraction,
    timeout_decrease_threshold: fraction,
    p95_baseline_multiplier: positive,
    rss_budget_ratio: fraction,
    decrease_factor: fraction,
    rss_budget_bytes: z.number().nonnegative(),
  })
  .strict();

export const configurationSchema = z
  .object({
    schema_version: z.literal(schemaVersion),
    search: z
      .object({
        default_max_results: positive,
        max_results: positive,
        candidate_budget: positive,
        timeout_ms: positive,
        default_profile: z.enum(["auto", "general", "technical", "news", "academic", "community"]),
        engines: enginesSchema,
      })
      .strict(),
    google: z
      .object({
        locale: z.string().min(1),
        max_concurrent_serp: positive,
        cooldown_ms: z.number().nonnegative(),
      })
      .strict(),
    mcp: z.object({ max_inbound_message_bytes: positive.max(16 * 1024 * 1024) }).strict(),
    renderer: z
      .object({
        navigation_timeout_ms: positive,
        settle_timeout_ms: positive,
        max_download_bytes: positive,
        concurrency: z.union([z.literal("auto"), positive]),
        initial_concurrency: positive,
        max_concurrency: positive,
        max_per_host: positive,
        obscura: z
          .object({ version: z.string().min(1), variant: z.literal("aarch64-macos-stealth") })
          .strict(),
      })
      .strict(),
    cache: z
      .object({
        max_bytes: positive,
        news_ttl_seconds: positive,
        general_ttl_seconds: positive,
        docs_ttl_seconds: positive,
        versioned_ttl_seconds: positive,
      })
      .strict(),
    output: z
      .object({
        search_passages_per_source: positive,
        search_passage_chars: positive,
        open_default_chars: positive,
        open_max_chars: positive,
        content_links: positive,
        navigation_links: positive,
      })
      .strict(),
    security: z
      .object({
        respect_robots_for_search: z.boolean(),
        allow_explicit_open_when_robots_disallow: z.boolean(),
        public_network_only: z.boolean(),
      })
      .strict(),
    logs: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]),
        retain_sessions: z.literal("forever"),
        compress_closed_sessions: z.boolean(),
      })
      .strict(),
    experimental: z
      .object({
        near_duplicate_threshold: fraction,
        general_profile_weight: fraction,
        specialized_profile_weight: fraction,
        passage_weight: fraction,
        concept_coverage_weight: fraction,
        source_type_weight: fraction,
        google_position_weight: fraction,
        source_quality_weight: fraction,
        freshness_weight: fraction,
        renderer_controller: controllerSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.search.default_max_results > value.search.max_results)
      context.addIssue({
        code: "custom",
        path: ["search", "default_max_results"],
        message: "must not exceed max_results",
      });
    if (value.renderer.initial_concurrency > value.renderer.max_concurrency)
      context.addIssue({
        code: "custom",
        path: ["renderer", "initial_concurrency"],
        message: "must not exceed max_concurrency",
      });
    if (value.experimental.renderer_controller.minimum_concurrency > value.renderer.max_concurrency)
      context.addIssue({
        code: "custom",
        path: ["experimental", "renderer_controller", "minimum_concurrency"],
        message: "must not exceed renderer maximum",
      });
  });

export type FullConfiguration = z.infer<typeof configurationSchema>;
export const defaultConfiguration: FullConfiguration = {
  schema_version: 1,
  search: {
    default_max_results: 5,
    max_results: 10,
    candidate_budget: 30,
    timeout_ms: 30_000,
    default_profile: "auto",
    engines: ["google", "duckduckgo", "bing"],
  },
  google: { locale: "auto", max_concurrent_serp: 1, cooldown_ms: 0 },
  mcp: { max_inbound_message_bytes: 4_194_304 },
  renderer: {
    navigation_timeout_ms: 15_000,
    settle_timeout_ms: 3_000,
    max_download_bytes: 26_214_400,
    concurrency: "auto",
    initial_concurrency: 8,
    max_concurrency: 40,
    max_per_host: 2,
    obscura: { version: "0.2.1", variant: "aarch64-macos-stealth" },
  },
  cache: {
    max_bytes: 5_368_709_120,
    news_ttl_seconds: 900,
    general_ttl_seconds: 86_400,
    docs_ttl_seconds: 604_800,
    versioned_ttl_seconds: 2_592_000,
  },
  output: {
    search_passages_per_source: 2,
    search_passage_chars: 1200,
    open_default_chars: 12_000,
    open_max_chars: 25_000,
    content_links: 20,
    navigation_links: 10,
  },
  security: {
    respect_robots_for_search: true,
    allow_explicit_open_when_robots_disallow: true,
    public_network_only: true,
  },
  logs: { level: "info", retain_sessions: "forever", compress_closed_sessions: true },
  experimental: {
    near_duplicate_threshold: 0.9,
    general_profile_weight: 0.7,
    specialized_profile_weight: 0.3,
    passage_weight: 0.35,
    concept_coverage_weight: 0.2,
    source_type_weight: 0.15,
    google_position_weight: 0.15,
    source_quality_weight: 0.1,
    freshness_weight: 0.05,
    renderer_controller: {
      window_completions: 20,
      window_min_ms: 10_000,
      healthy_windows_before_growth: 2,
      growth_step: 2,
      minimum_concurrency: 1,
      error_decrease_threshold: 0.15,
      timeout_decrease_threshold: 0.1,
      p95_baseline_multiplier: 2,
      rss_budget_ratio: 0.8,
      decrease_factor: 0.5,
      rss_budget_bytes: 0,
    },
  },
};

export function mergeDefaults(
  input: Record<string, unknown>,
  defaults: Record<string, unknown> = defaultConfiguration,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(input))
    result[key] =
      isRecord(value) && isRecord(defaults[key]) ? mergeDefaults(value, defaults[key]) : value;
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
