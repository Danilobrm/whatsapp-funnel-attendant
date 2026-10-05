/**
 * Validação dos argumentos que o MODELO manda para as ferramentas. Puro.
 * Modelo pequeno erra tipo ("12" no lugar de 12, `null` no lugar de omitir),
 * então aqui se aceita o que é inequívoco e se recusa o resto com um erro
 * curto que volta ao modelo para ele corrigir — nunca lança.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (error: string): Parsed<never> => ({ ok: false, error });

function record(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

const absent = (v: unknown) => v === undefined || v === null || v === "";

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d{1,9}$/.test(v.trim())) return Number(v);
  return null;
}

function toText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  return text.length === 0 ? null : text.slice(0, max);
}

// --------------------------------------------------------------- search_menu

export function parseSearchMenu(raw: unknown): Parsed<{ query: string }> {
  const query = record(raw).query;
  if (absent(query)) return ok({ query: "" });
  if (typeof query !== "string") return fail("query deve ser texto");
  return ok({ query: query.slice(0, 120) });
}

// ------------------------------------------------------------------ add_item

export interface AddItemArgs {
  itemId: number;
  sizeId: number | null;
  optionIds: number[];
  quantity: number;
  notes: string | null;
}

export function parseAddItem(raw: unknown): Parsed<AddItemArgs> {
  const r = record(raw);
  const itemId = toInt(r.item_id);
  if (itemId === null)
    return fail("item_id é obrigatório (número do search_menu)");

  let sizeId: number | null = null;
  if (!absent(r.size_id)) {
    sizeId = toInt(r.size_id);
    if (sizeId === null) return fail("size_id deve ser um número");
  }

  let optionIds: number[] = [];
  if (!absent(r.option_ids)) {
    if (!Array.isArray(r.option_ids))
      return fail("option_ids deve ser uma lista");
    const ids = r.option_ids.map(toInt);
    if (ids.some((id) => id === null)) {
      return fail("option_ids deve conter só números");
    }
    optionIds = [...new Set(ids as number[])];
  }

  let quantity = 1;
  if (!absent(r.quantity)) {
    const q = toInt(r.quantity);
    if (q === null) return fail("quantity deve ser um número inteiro");
    quantity = q;
  }

  return ok({
    itemId,
    sizeId,
    optionIds,
    quantity,
    notes: toText(r.notes, 200),
  });
}

// ------------------------------------------------- remove_item / update_quantity

export function parseLineNumber(raw: unknown): Parsed<{ line: number }> {
  const line = toInt(record(raw).line_number);
  if (line === null || line < 1) {
    return fail(
      "line_number é obrigatório (número da linha em view_cart, começando em 1)",
    );
  }
  return ok({ line });
}

export function parseUpdateQuantity(
  raw: unknown,
): Parsed<{ line: number; quantity: number }> {
  const line = parseLineNumber(raw);
  if (!line.ok) return line;
  const quantity = toInt(record(raw).quantity);
  if (quantity === null) return fail("quantity deve ser um número inteiro");
  return ok({ line: line.value.line, quantity });
}

// ----------------------------------------------------------- set_fulfillment

export interface FulfillmentArgs {
  type: "delivery" | "pickup";
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  neighborhood: string | null;
}

export function parseSetFulfillment(raw: unknown): Parsed<FulfillmentArgs> {
  const r = record(raw);
  if (r.type !== "delivery" && r.type !== "pickup") {
    return fail('type deve ser "delivery" ou "pickup"');
  }
  // Modelo pequeno manda o endereço como texto ("Rua 7, 12") ou solto no topo
  // em vez de dentro de `address`. Aceita os três jeitos.
  const address =
    typeof r.address === "string" ? { street: r.address } : record(r.address);
  const pick = (key: string) => address[key] ?? r[key];
  const number = pick("number");
  return ok({
    type: r.type,
    street: toText(pick("street"), 160),
    number: typeof number === "number" ? String(number) : toText(number, 20),
    complement: toText(pick("complement"), 80),
    reference: toText(pick("reference"), 160),
    neighborhood: toText(r.neighborhood ?? address.neighborhood, 120),
  });
}

// --------------------------------------------------------------- set_payment

export interface PaymentArgs {
  method: "pix" | "cash" | "card_on_delivery";
  changeForCents: number | null;
}

/** Máximo aceito de "troco para": barra número absurdo digitado/alucinado. */
const MAX_CHANGE_REAIS = 10_000;

export function parseSetPayment(raw: unknown): Parsed<PaymentArgs> {
  const r = record(raw);
  if (
    r.method !== "pix" &&
    r.method !== "cash" &&
    r.method !== "card_on_delivery"
  ) {
    return fail('method deve ser "pix", "cash" ou "card_on_delivery"');
  }

  let changeForCents: number | null = null;
  const change = r.change_for_reais;
  if (!absent(change) && change !== 0) {
    const value =
      typeof change === "string" ? Number(change.replace(",", ".")) : change;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > MAX_CHANGE_REAIS
    ) {
      return fail("change_for_reais deve ser um valor em reais (ex.: 100)");
    }
    changeForCents = Math.round(value * 100);
    if (r.method !== "cash") {
      return fail("troco só existe para pagamento em dinheiro (cash)");
    }
  }
  return ok({ method: r.method, changeForCents });
}

// ----------------------------------------------------------------- call_human

export function parseCallHuman(raw: unknown): Parsed<{ reason: string }> {
  return ok({
    reason: toText(record(raw).reason, 300) ?? "sem motivo informado",
  });
}
