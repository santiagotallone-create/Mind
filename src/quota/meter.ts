/**
 * Medidor de tiempo activo de una charla.
 * Cuenta solo mientras la charla está iniciada, conectada y sin pausa. Ni la pausa ni el tiempo sin
 * conexión descuentan; los silencios con la conexión abierta sí. La medición es del servidor: la app no puede alterarla.
 */
export class ActiveTimeMeter {
  private accruedMs = 0;
  private since: number | null = null;
  private started = false;
  private stopped = false;
  private paused = false;
  private connected = true;

  /** `now` debe ser un reloj monótono en ms. Por defecto, performance.now(). */
  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    if (this.started) return;
    this.change(() => {
      this.started = true;
    });
  }

  pause(): void {
    this.change(() => {
      this.paused = true;
    });
  }

  resume(): void {
    this.change(() => {
      this.paused = false;
    });
  }

  /** Se perdió la conexión de la app: el tiempo deja de contar. */
  disconnect(): void {
    this.change(() => {
      this.connected = false;
    });
  }

  reconnect(): void {
    this.change(() => {
      this.connected = true;
    });
  }

  /** Cierra la medición. Es definitivo. */
  stop(): void {
    this.change(() => {
      this.stopped = true;
    });
  }

  get isRunning(): boolean {
    return this.started && !this.stopped && this.connected && !this.paused;
  }

  get activeMs(): number {
    if (this.since === null) return this.accruedMs;
    return this.accruedMs + Math.max(0, this.now() - this.since);
  }

  /** Segundos completos de tiempo activo. Es lo que se descuenta del bolsón. */
  get activeSeconds(): number {
    return Math.floor(this.activeMs / 1000);
  }

  private change(apply: () => void): void {
    this.accruedMs = this.activeMs;
    apply();
    this.since = this.isRunning ? this.now() : null;
  }
}
