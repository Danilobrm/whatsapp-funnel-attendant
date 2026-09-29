/**
 * Rejeição de cardápio ou configuração de loja — mapeada para HTTP 422 em
 * `errorHandler`. Compartilhada entre `modules/menu` e `modules/store` porque
 * as duas telas do painel (Cardápio, Loja) nascem juntas na mesma fase e
 * validam o mesmo tipo de entrada (formulário do dono do restaurante).
 */
export type InvalidMenuCode =
  | "name_required"
  | "name_too_long"
  | "category_required"
  | "category_not_found"
  | "item_not_found"
  | "price_or_sizes_required"
  | "price_invalid"
  | "size_required"
  | "size_price_invalid"
  | "min_select_invalid"
  | "max_select_invalid"
  | "min_greater_than_max"
  | "unknown_pricing_rule"
  | "group_not_found"
  | "option_not_found"
  | "size_not_found"
  | "timezone_required"
  | "opening_hours_invalid"
  | "min_order_invalid"
  | "estimated_minutes_invalid"
  | "unknown_payment_method"
  | "fulfillment_required"
  | "neighborhood_required"
  | "fee_invalid"
  | "zone_not_found"
  | "image_required"
  | "image_invalid_type"
  | "image_too_large";

export class InvalidMenuError extends Error {
  readonly code: InvalidMenuCode;
  readonly field: string;

  constructor(code: InvalidMenuCode, field: string) {
    super(`invalid_menu:${code}`);
    this.name = "InvalidMenuError";
    this.code = code;
    this.field = field;
  }
}
