import { z } from "zod";

export const MAX_INBOUND_MESSAGE_BYTES = 4 * 1024 * 1024;

const profileSchema = z.enum(["auto", "general", "technical", "news", "academic", "community"]);
const reasonSchema = z.enum([
  "renderer_unavailable",
  "authentication_required",
  "consent_required",
  "paywall",
  "captcha",
  "waf",
  "unsupported_format",
  "unsupported_or_ocr_required",
  "timeout",
  "network_error",
  "internal_error",
]);
const passageSchema = z.object({
  text: z.string(),
  score: z.number(),
  heading: z.string().optional(),
  fragment: z.string().optional(),
  document_page: z.number().int().optional(),
  passage_hash: z.string(),
});
const codeBlockSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  trust: z.literal("external_untrusted"),
  invisible_character_warnings: z.array(z.string()),
  heading: z.string().optional(),
  fragment: z.string().optional(),
  document_page: z.number().int().optional(),
  content_hash: z.string(),
});
const contentLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  context: z.string().optional(),
});
const navigationLinkSchema = z.object({ title: z.string(), url: z.string() });
const resultSchema = z.object({
  title: z.string(),
  url: z.string(),
  final_url: z.string(),
  discovery: z.enum(["google", "local_cache", "direct_open"]),
  source_type: z.string(),
  mime_type: z.string(),
  published_at: z.string().optional(),
  fetched_at: z.string(),
  score: z.number().min(0).max(1),
  trust: z.literal("external_untrusted"),
  passages: z.array(passageSchema),
  code_blocks: z.array(codeBlockSchema),
  content_links: z.array(contentLinkSchema),
  navigation_links: z.array(navigationLinkSchema),
  content_hash: z.string(),
});

export const structuredToolResultSchema = z
  .object({
    investigation_id: z.string(),
    status: z.enum(["success", "partial", "no_relevant_results", "blocked", "error"]),
    reason: reasonSchema.optional(),
    confidence: z.enum(["high", "medium", "low"]),
    results: z.array(resultSchema),
    suggested_queries: z
      .array(z.object({ query: z.string(), source: z.enum(["google_related", "google_question"]) }))
      .optional(),
    /** The derived second query, when discovery made one (SEARCH-001). */
    follow_up_query: z.string().optional(),
  })
  .superRefine((value, context) => {
    if ((value.status === "blocked" || value.status === "error") && !value.reason)
      context.addIssue({
        code: "custom",
        message: "reason is required for blocked and error results",
        path: ["reason"],
      });
  });

export const webSearchInputSchema = z.object({
  query: z.string(),
  investigation_id: z.string().optional(),
  max_results: z.number().int().min(1).max(10).default(5),
  profile: profileSchema.default("auto"),
  locale: z.string().optional(),
});
export const webOpenInputSchema = z.object({
  url: z.string().url(),
  investigation_id: z.string().optional(),
  focus: z.string().optional(),
  max_chars: z.number().int().positive().max(25_000).default(12_000),
});

export type WebSearchArguments = z.output<typeof webSearchInputSchema>;
export type WebOpenArguments = z.output<typeof webOpenInputSchema>;
