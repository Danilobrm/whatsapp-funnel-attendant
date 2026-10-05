import { InvalidInputError } from "../../errors/invalidInput.error.js";

/** Telefone fictício de cliente de teste: só dígitos, 8 a 15. */
export const PHONE_RE = /^\d{8,15}$/;

export function simulatorContactFor(
  adminUserId: number,
  contactId: unknown,
): string {
  if (contactId === undefined || contactId === null || contactId === "") {
    return `admin-${adminUserId}`;
  }
  if (typeof contactId !== "string" || !PHONE_RE.test(contactId)) {
    throw new InvalidInputError("invalid_contact", "contactId");
  }
  return `sim-${contactId}`;
}
