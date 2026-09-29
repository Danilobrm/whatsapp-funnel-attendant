import { describe, expect, it } from 'vitest';

import {
  canCancel,
  columnOf,
  elapsedMinutes,
  isLate,
  itemsSummary,
  primaryAction,
} from './orderView.ts';

const NOW = Date.parse('2026-09-29T20:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('orderView', () => {
  it('maps every status to its board column', () => {
    expect(columnOf('pending')).toBe('pending');
    expect(columnOf('accepted')).toBe('preparing');
    expect(columnOf('out_for_delivery')).toBe('dispatched');
    expect(columnOf('ready_for_pickup')).toBe('dispatched');
    expect(columnOf('completed')).toBe('done');
    expect(columnOf('rejected')).toBe('done');
    expect(columnOf('cancelled')).toBe('done');
  });

  it('a pending order is late after 5 minutes; other statuses never', () => {
    expect(isLate({ status: 'pending', createdAt: minutesAgo(4) }, NOW)).toBe(
      false,
    );
    expect(isLate({ status: 'pending', createdAt: minutesAgo(6) }, NOW)).toBe(
      true,
    );
    expect(isLate({ status: 'accepted', createdAt: minutesAgo(30) }, NOW)).toBe(
      false,
    );
  });

  it('elapsedMinutes floors and never goes negative', () => {
    expect(elapsedMinutes({ createdAt: minutesAgo(7.9) }, NOW)).toBe(7);
    expect(elapsedMinutes({ createdAt: minutesAgo(-1) }, NOW)).toBe(0);
  });

  it('primary action follows status and fulfillment', () => {
    expect(
      primaryAction({ status: 'pending', fulfillment: 'delivery' })?.to,
    ).toBe('accepted');
    expect(
      primaryAction({ status: 'accepted', fulfillment: 'delivery' })?.to,
    ).toBe('out_for_delivery');
    expect(
      primaryAction({ status: 'accepted', fulfillment: 'pickup' })?.to,
    ).toBe('ready_for_pickup');
    expect(
      primaryAction({ status: 'ready_for_pickup', fulfillment: 'pickup' })?.to,
    ).toBe('completed');
    expect(
      primaryAction({ status: 'completed', fulfillment: 'pickup' }),
    ).toBeNull();
  });

  it('only pending and accepted orders can be cancelled', () => {
    expect(canCancel('pending')).toBe(true);
    expect(canCancel('accepted')).toBe(true);
    expect(canCancel('out_for_delivery')).toBe(false);
  });

  it('itemsSummary lists quantity and name', () => {
    expect(
      itemsSummary({
        items: [
          {
            name: 'X-Tudo',
            quantity: 2,
            sizeName: null,
            unitPriceCents: 0,
            options: [],
            notes: null,
          },
          {
            name: 'Refri',
            quantity: 1,
            sizeName: null,
            unitPriceCents: 0,
            options: [],
            notes: null,
          },
        ],
      }),
    ).toBe('2× X-Tudo, 1× Refri');
  });
});
