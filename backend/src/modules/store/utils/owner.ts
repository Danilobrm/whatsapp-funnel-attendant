/**
 * Compara o número do dono cadastrado no painel (livre: "(61) 99999-9999",
 * "+55 61 99999-9999"...) com o `wa_id` que a Meta manda no webhook (só
 * dígitos, com DDI). Puro.
 *
 * Detalhe do Brasil: a Meta às vezes entrega o `wa_id` de celulares SEM o 9º
 * dígito (`556199999999`) enquanto o dono digita com ele (`5561999999999`).
 * Os dois são normalizados para a forma sem o 9.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Sem DDI (DDD + número): assume Brasil.
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  // 55 + DDD(2) + 9 + 8 dígitos → tira o 9 extra.
  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    digits = digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}

export function isOwnerNumber(
  ownerWhatsapp: string | null,
  from: string,
): boolean {
  if (!ownerWhatsapp) return false;
  const owner = normalizeWhatsAppNumber(ownerWhatsapp);
  // Número curto demais não identifica ninguém — nunca casa.
  return owner.length >= 10 && owner === normalizeWhatsAppNumber(from);
}
