export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parser incremental de Server-Sent Events. O `fetch` entrega o corpo em
 * pedaços arbitrários — um evento pode chegar partido entre dois chunks —,
 * então o parser guarda o resto até ver a linha em branco que fecha o evento.
 * Linhas começando com `:` são comentários (heartbeat) e são ignoradas.
 */
export function createSseParser(): { push: (chunk: string) => SseEvent[] } {
  let buffer = '';

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: SseEvent[] = [];
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line === '' || line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const value =
            colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
        if (data.length > 0) events.push({ event, data: data.join('\n') });
      }
      return events;
    },
  };
}
