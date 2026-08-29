import type { DnsResolver } from "../application/public-network.ts";

/**
 * Resolves a hostname through Bun's DNS API. Both address families are
 * requested so an IPv6-only private answer cannot slip past a validator that
 * only ever saw the IPv4 records.
 */
export function createDnsResolver(): DnsResolver {
  return {
    async resolve(hostname: string): Promise<readonly string[]> {
      const answers = await Bun.dns.lookup(hostname, { family: 0 });
      return answers.map((answer) => answer.address);
    },
  };
}
