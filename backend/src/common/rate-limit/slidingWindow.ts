export interface SlidingWindowOptions {
  windowMs: number;
  max: number;
  /** Relógio injetável para teste. */
  now?: () => number;
}

/**
 * Janela deslizante em memória, uma chave por IP. Instância única, como o
 * barramento de pedidos: com várias instâncias o limite vale por instância —
 * trocar por Redis atrás da mesma assinatura (`allow(key)`).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private lastSweep: number;

  constructor({ windowMs, max, now = Date.now }: SlidingWindowOptions) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
    this.lastSweep = now();
  }

  /** Registra a chamada e diz se passa; uma chamada barrada não conta. */
  allow(key: string): boolean {
    const t = this.now();

    // Varre chaves velhas de vez em quando: sem isto o Map só cresce.
    if (t - this.lastSweep > this.windowMs) {
      for (const [k, times] of this.hits) {
        if (times.every((h) => t - h >= this.windowMs)) this.hits.delete(k);
      }
      this.lastSweep = t;
    }

    const recent = (this.hits.get(key) ?? []).filter(
      (h) => t - h < this.windowMs,
    );
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}
