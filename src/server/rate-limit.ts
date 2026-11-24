/** Límite de peticiones por ventana deslizante, en memoria. Alcanza con una sola instancia (--max-instances 1). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private calls = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra un intento. Si ya se alcanzó el límite lo rechaza y no lo cuenta, así un bloqueo no se alarga solo. */
  check(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (++this.calls % 500 === 0) this.sweep(now);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  private sweep(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= now - this.windowMs)) this.hits.delete(key);
    }
  }
}
