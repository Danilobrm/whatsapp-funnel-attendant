import { describe, expect, it } from 'vitest';

import { createSseParser } from './sse.ts';

describe('createSseParser', () => {
  it('parses a complete event', () => {
    const parser = createSseParser();
    expect(parser.push('event: order_created\ndata: {"id":1}\n\n')).toEqual([
      { event: 'order_created', data: '{"id":1}' },
    ]);
  });

  it('joins an event split across chunks', () => {
    const parser = createSseParser();
    expect(parser.push('event: order_upd')).toEqual([]);
    expect(parser.push('ated\ndata: {"id"')).toEqual([]);
    expect(parser.push(':2}\n\n')).toEqual([
      { event: 'order_updated', data: '{"id":2}' },
    ]);
  });

  it('returns several events from one chunk and ignores comments', () => {
    const parser = createSseParser();
    const events = parser.push(
      ': connected\n\nevent: a\ndata: 1\n\n: ping\n\nevent: b\ndata: 2\n\n',
    );
    expect(events).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('defaults the event name to "message" and handles CRLF', () => {
    const parser = createSseParser();
    expect(parser.push('data: x\r\n\r\n')).toEqual([
      { event: 'message', data: 'x' },
    ]);
  });
});
