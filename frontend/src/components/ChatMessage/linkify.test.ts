import { describe, expect, it } from 'vitest';

import { splitLinks } from './linkify.ts';

describe('splitLinks', () => {
  it('returns plain text as a single part', () => {
    expect(splitLinks('oi, tudo bem?')).toEqual([
      { type: 'text', value: 'oi, tudo bem?' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });

  it('extracts a link between text', () => {
    expect(splitLinks('Abra https://loja.app/c/abc.def e monte')).toEqual([
      { type: 'text', value: 'Abra ' },
      { type: 'link', value: 'https://loja.app/c/abc.def' },
      { type: 'text', value: ' e monte' },
    ]);
  });

  it('a link alone or on its own line', () => {
    expect(splitLinks('http://localhost:5173/c/a.b.c')).toEqual([
      { type: 'link', value: 'http://localhost:5173/c/a.b.c' },
    ]);
    expect(splitLinks('cardápio:\nhttps://x.app/c/t\n\nvolte aqui')).toEqual([
      { type: 'text', value: 'cardápio:\n' },
      { type: 'link', value: 'https://x.app/c/t' },
      { type: 'text', value: '\n\nvolte aqui' },
    ]);
  });

  it('leaves sentence punctuation out of the URL', () => {
    expect(splitLinks('veja https://x.app/c/t.')).toEqual([
      { type: 'text', value: 'veja ' },
      { type: 'link', value: 'https://x.app/c/t' },
      { type: 'text', value: '.' },
    ]);
    expect(splitLinks('(https://x.app/c/t), ok')).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', value: 'https://x.app/c/t' },
      { type: 'text', value: '), ok' },
    ]);
  });

  it('keeps dots inside the URL (the JWT has dots)', () => {
    expect(splitLinks('https://x.app/c/aaa.bbb.ccc')).toEqual([
      { type: 'link', value: 'https://x.app/c/aaa.bbb.ccc' },
    ]);
  });

  it('finds several links', () => {
    const parts = splitLinks('https://a.app/1 e https://b.app/2');

    expect(parts.filter((p) => p.type === 'link').map((p) => p.value)).toEqual([
      'https://a.app/1',
      'https://b.app/2',
    ]);
  });

  // Nunca vira <a href="javascript:...">.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'ftp://x.app',
    'www.x.app',
  ])('does not link %s', (text) => {
    expect(splitLinks(text)).toEqual([{ type: 'text', value: text }]);
  });
});
