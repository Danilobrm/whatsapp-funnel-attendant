import { InvalidOrderError } from "../errors/order.errors.js";
import { ORDER_STATUSES, REJECT_REASONS } from "../types/order.types.js";

import type {
  OrderStatus,
  RejectReason,
  TransitionInput,
} from "../types/order.types.js";

const MAX_NOTE_CHARS = 280;

/** Valida o corpo de `POST /:id/transition` (vem cru do cliente). */
export function parseTransitionInput(body: unknown): TransitionInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!ORDER_STATUSES.includes(raw.to as OrderStatus)) {
    throw new InvalidOrderError("invalid_status", "to");
  }
  const to = raw.to as OrderStatus;
  if (to !== "rejected") return { to };

  if (!REJECT_REASONS.includes(raw.reason as RejectReason)) {
    throw new InvalidOrderError("reject_reason_required", "reason");
  }
  const reason = raw.reason as RejectReason;
  const note =
    typeof raw.note === "string" && raw.note.trim().length > 0
      ? raw.note.trim().slice(0, MAX_NOTE_CHARS)
      : null;
  if (reason === "other" && note === null) {
    throw new InvalidOrderError("reject_note_required", "note");
  }
  return { to, reason, note };
}
