/** Registro simple de latencias para comparar motores de voz. */
export class LatencyTracker {
  private samples: number[] = [];

  record(ms: number): void {
    this.samples.push(ms);
  }

  get all(): number[] {
    return [...this.samples];
  }

  get average(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
