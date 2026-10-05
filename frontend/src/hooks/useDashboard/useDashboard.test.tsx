import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/dashboard/dashboard.ts', () => ({ fetchDashboard: vi.fn() }));

import { fetchDashboard, type Dashboard } from '../../api/dashboard/dashboard.ts';
import { DASHBOARD_REFRESH_MS, useDashboard } from './useDashboard.ts';

const fetchMock = vi.mocked(fetchDashboard);

function dashboard(orders: number): Dashboard {
  return {
    timezone: 'America/Sao_Paulo',
    today: { orders, revenueCents: 0, ticketCents: 0, rejected: 0, active: 0 },
    last7Days: [],
    topItems: [],
    fulfillment: [],
    payment: [],
    store: { open: true, paused: false, nextOpeningAt: null },
    menuFunnel: { sent: 0, opened: 0, confirmed: 0, ordered: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDashboard', () => {
  it('loads the dashboard', async () => {
    fetchMock.mockResolvedValue({ dashboard: dashboard(3) });
    const { result } = renderHook(() => useDashboard());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.today.orders).toBe(3);
    expect(result.current.error).toBe(false);
  });

  it('refreshes every minute', async () => {
    fetchMock.mockResolvedValueOnce({ dashboard: dashboard(1) });
    fetchMock.mockResolvedValueOnce({ dashboard: dashboard(2) });
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.data?.today.orders).toBe(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_MS);
    });

    expect(result.current.data?.today.orders).toBe(2);
  });

  it('keeps the previous numbers when a refresh fails', async () => {
    fetchMock.mockResolvedValueOnce({ dashboard: dashboard(5) });
    fetchMock.mockRejectedValueOnce(new Error('HTTP 500'));
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.data?.today.orders).toBe(5));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_MS);
    });

    expect(result.current.data?.today.orders).toBe(5);
    expect(result.current.error).toBe(true);
  });
});
