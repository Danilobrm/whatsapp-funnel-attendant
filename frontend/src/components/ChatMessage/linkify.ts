export type TextPart =
  { type: 'text'; value: string } | { type: 'link'; value: string };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
/** Pontuação que costuma vir colada ao fim da URL numa frase. */
const TRAILING = /[.,;:!?)\]}]+$/;

/**
 * Quebra um texto em pedaços de texto e de link. Só `http`/`https` viram link
 * (nunca `javascript:`), e a pontuação final de frase fica de fora da URL.
 * Devolve DADOS — quem renderiza usa `<a>` do React, nunca `innerHTML`.
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const url = raw.replace(TRAILING, '');
    if (start > last)
      parts.push({ type: 'text', value: text.slice(last, start) });
    parts.push({ type: 'link', value: url });
    const trailing = raw.slice(url.length);
    if (trailing) parts.push({ type: 'text', value: trailing });
    last = start + raw.length;
  }

  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  // A pontuação sobrada e o texto seguinte viram um pedaço só.
  return parts.reduce<TextPart[]>((merged, part) => {
    const previous = merged[merged.length - 1];
    if (part.type === 'text' && previous?.type === 'text') {
      previous.value += part.value;
    } else {
      merged.push({ ...part });
    }
    return merged;
  }, []);
}
