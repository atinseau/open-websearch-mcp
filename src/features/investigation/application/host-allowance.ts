/**
 * How many pages of one host a single search may spend itself on.
 *
 * A page can fail on its own, so one failure says nothing about its host and
 * must not cost a site its remaining pages. A second says the host is the
 * thing that is failing.
 *
 * Measured on the corpus's Japanese question, every page of `www.nic.ad.jp`
 * fails identically and each spends the renderer's full navigation deadline
 * before it does. Two sat at the top of the pool, so the search spent about
 * sixty seconds - twice its own thirty-second budget - on a host that answered
 * nothing, and expired before reaching the sources that do answer.
 */
const hostFailureLimit = 2;

/**
 * Tracks how much of one search has been spent on each host.
 *
 * A page still in flight counts against its host's allowance, because its
 * verdict is not yet known and a host is judged on how many of its pages were
 * tried rather than on how many have already come back. Counting only settled
 * failures let the third page start while the first two were still running, so
 * the limit took effect only once the cost it exists to avoid had been paid.
 */
export class HostAllowance {
  readonly #failures = new Map<string, number>();
  readonly #inFlight = new Map<string, number>();

  /** True when this host may not be asked for another page. */
  closed(host: string): boolean {
    return (this.#failures.get(host) ?? 0) + (this.#inFlight.get(host) ?? 0) >= hostFailureLimit;
  }

  started(host: string): void {
    this.#inFlight.set(host, (this.#inFlight.get(host) ?? 0) + 1);
  }

  settled(host: string, succeeded: boolean): void {
    this.#inFlight.set(host, Math.max(0, (this.#inFlight.get(host) ?? 1) - 1));
    if (!succeeded) this.#failures.set(host, (this.#failures.get(host) ?? 0) + 1);
  }
}
