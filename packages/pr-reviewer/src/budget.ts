export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

// Hard cap on tokens per run. The point is not precision, it's making sure a
// 4k-line refactor PR can't quietly cost $5 on every push.
export class TokenBudget {
  private spent = 0;
  private reserved = 0;

  constructor(readonly limit: number) {}

  get remaining(): number {
    return this.limit - this.spent - this.reserved;
  }

  get used(): number {
    return this.spent;
  }

  tryReserve(estimate: number): boolean {
    if (estimate > this.remaining) return false;
    this.reserved += estimate;
    return true;
  }

  settle(estimate: number, actual: Usage): void {
    this.reserved = Math.max(0, this.reserved - estimate);
    this.spent += actual.inputTokens + actual.outputTokens;
  }

  release(estimate: number): void {
    this.reserved = Math.max(0, this.reserved - estimate);
  }
}
