import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/simulator/simulator.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/simulator/simulator.ts')>();
  return {
    ...actual,
    fetchSimulatedCustomers: vi.fn(),
    createSimulatedCustomer: vi.fn(),
  };
});

const api = await import('../../api/simulator/simulator.ts');
const { useSimulatedCustomers } = await import('./useSimulatedCustomers.ts');

const fetchCustomers = vi.mocked(api.fetchSimulatedCustomers);
const createCustomer = vi.mocked(api.createSimulatedCustomer);

const ANA = { contactId: '5561990000001', name: 'Ana', phone: '5561990000001' };
const BRUNO = {
  contactId: '5561990000002',
  name: 'Bruno',
  phone: '5561990000002',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useSimulatedCustomers', () => {
  it('loads the tenant test customers', async () => {
    fetchCustomers.mockResolvedValue([ANA]);

    const { result } = renderHook(() => useSimulatedCustomers());

    await waitFor(() => expect(result.current.customers).toEqual([ANA]));
  });

  // A lista é conveniência: o simulador segue com o cliente padrão.
  it('stays empty (no crash) when the list fails to load', async () => {
    fetchCustomers.mockRejectedValue(new Error('HTTP 500'));

    const { result } = renderHook(() => useSimulatedCustomers());

    await waitFor(() => expect(fetchCustomers).toHaveBeenCalled());
    expect(result.current.customers).toEqual([]);
  });

  it('adds a created customer to the list and returns it', async () => {
    fetchCustomers.mockResolvedValue([ANA]);
    createCustomer.mockResolvedValue(BRUNO);
    const { result } = renderHook(() => useSimulatedCustomers());
    await waitFor(() => expect(result.current.customers).toEqual([ANA]));

    let created;
    await act(async () => {
      created = await result.current.create({
        name: 'Bruno',
        phone: '5561990000002',
      });
    });

    expect(created).toEqual(BRUNO);
    expect(result.current.customers).toEqual([ANA, BRUNO]);
    expect(createCustomer).toHaveBeenCalledWith({
      name: 'Bruno',
      phone: '5561990000002',
    });
  });

  // Mesmo telefone = mesmo cliente (o backend faz upsert): sem linha duplicada.
  it('updates instead of duplicating when the phone already exists', async () => {
    fetchCustomers.mockResolvedValue([ANA]);
    createCustomer.mockResolvedValue({ ...ANA, name: 'Ana Maria' });
    const { result } = renderHook(() => useSimulatedCustomers());
    await waitFor(() => expect(result.current.customers).toEqual([ANA]));

    await act(async () => {
      await result.current.create({ name: 'Ana Maria', phone: ANA.phone });
    });

    expect(result.current.customers).toEqual([{ ...ANA, name: 'Ana Maria' }]);
  });

  it('propagates a rejection so the form can show it by code', async () => {
    fetchCustomers.mockResolvedValue([]);
    createCustomer.mockRejectedValue(
      new api.SimulatorRejectedError('phone_invalid'),
    );
    const { result } = renderHook(() => useSimulatedCustomers());

    await expect(
      act(() => result.current.create({ name: 'Ana', phone: '1' })),
    ).rejects.toMatchObject({ code: 'phone_invalid' });
    expect(result.current.customers).toEqual([]);
  });
});
