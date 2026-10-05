import type { PricingProblem } from "../../order/utils/pricing.js";

export type InvalidPublicCartCode = "cart_empty" | "cart_invalid";

/**
 * Carrinho enviado pela página do cardápio recusado → 422. `problems` diz o
 * que há de errado em cada linha (`lineIndex` 0-based): a página mostra por
 * `publicMenu.errors.<code>`, nunca texto do servidor.
 */
export class InvalidPublicCartError extends Error {
  readonly code: InvalidPublicCartCode;
  readonly problems: Pick<PricingProblem, "code" | "lineIndex">[];

  constructor(
    code: InvalidPublicCartCode,
    problems: Pick<PricingProblem, "code" | "lineIndex">[] = [],
  ) {
    super(`invalid_public_cart:${code}`);
    this.name = "InvalidPublicCartError";
    this.code = code;
    this.problems = problems;
  }
}

/** Muitas chamadas do mesmo IP nesta janela → 429. */
export class RateLimitedError extends Error {
  readonly code = "rate_limited";

  constructor() {
    super("rate_limited");
    this.name = "RateLimitedError";
  }
}
