/** Tracks time to first token and total latency for one streamed call. */
export class StreamTimer {
  private readonly start = performance.now();
  private first: number | null = null;

  mark(): void {
    this.first ??= performance.now();
  }

  get ttftMs(): number | null {
    return this.first === null ? null : Math.round(this.first - this.start);
  }

  totalMs(): number {
    return Math.round(performance.now() - this.start);
  }
}
