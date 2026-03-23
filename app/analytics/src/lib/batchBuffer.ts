/**
 * Generic batch buffer — accumulates items and flushes on count OR timer,
 * whichever comes first. Safe for concurrent adds: the buffer is spliced
 * atomically so a timer flush never races with a count-triggered flush.
 */
export class BatchBuffer<T> {
  private buffer: T[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly flush:      (items: T[]) => Promise<unknown>,
    private readonly maxSize:    number = 100,
    private readonly intervalMs: number = 5_000,
  ) {}

  start(): void {
    this.timer = setInterval(() => { this.flushNow().catch(console.error); }, this.intervalMs);
  }

  async add(item: T): Promise<void> {
    this.buffer.push(item);
    if (this.buffer.length >= this.maxSize) {
      await this.flushNow();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flushNow();
  }

  private async flushNow(): Promise<void> {
    if (this.buffer.length === 0) return;
    const items = this.buffer.splice(0);
    await this.flush(items);
  }
}
