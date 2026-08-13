export type ProviderCircuitState = {
  failures: number;
  openUntil: number;
};

export class ProviderCircuitBreaker {
  private readonly states = new Map<string, ProviderCircuitState>();

  constructor(
    private readonly failureThreshold: number = 3,
    private readonly cooldownMs: number = 60_000,
    private readonly permanentCooldownMs: number = 5 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  canRequest(provider: string): boolean {
    const state = this.states.get(provider);
    if (!state) return true;
    if (state.openUntil > 0 && state.openUntil <= this.now()) {
      this.states.delete(provider);
      return true;
    }
    return state.openUntil === 0;
  }

  recordSuccess(provider: string): void {
    this.states.delete(provider);
  }

  reset(provider?: string): void {
    if (provider) this.states.delete(provider);
    else this.states.clear();
  }

  recordFailure(provider: string, permanent: boolean): void {
    const current = this.states.get(provider) ?? { failures: 0, openUntil: 0 };
    const failures = current.failures + 1;
    const shouldOpen = permanent || failures >= this.failureThreshold;
    this.states.set(provider, {
      failures,
      openUntil: shouldOpen
        ? this.now() + (permanent ? this.permanentCooldownMs : this.cooldownMs)
        : 0
    });
  }

  remainingMs(provider: string): number {
    const state = this.states.get(provider);
    return state ? Math.max(0, state.openUntil - this.now()) : 0;
  }
}
