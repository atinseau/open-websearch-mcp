import robotsParser from "robots-txt-parser";

const robots = robotsParser({ allowOnNeutral: false, userAgent: "open-websearch-mcp" });
robots.parseRobots("https://example.test", "User-agent: *\nDisallow: /private\nAllow: /public\n");
const canCrawlPrivate = robots.canCrawlSync("https://example.test/private");
const canCrawlPublic = robots.canCrawlSync("https://example.test/public");

if (canCrawlPrivate || !canCrawlPublic) throw new Error("Robots parser did not apply fixture policy");
console.log(JSON.stringify({ candidate: "robots-txt-parser", canCrawlPrivate, canCrawlPublic }));
