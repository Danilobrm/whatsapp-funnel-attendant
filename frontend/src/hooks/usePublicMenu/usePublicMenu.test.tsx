import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/publicMenu/publicMenu.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/publicMenu/publicMenu.ts')>();
  return {
    ...actual,
    fetchPublicMenu: vi.fn(),
    confirmPublicCart: vi.fn(),
  };
});

const api = await import('../../api/publicMenu/publicMenu.ts');
const { usePublicMenu } = await import('./usePublicMenu.ts');

const fetchMenu = vi.mocked(api.fetchPublicMenu);
const confirmCart = vi.mocked(api.confirmPublicCart);

const VIEW: import('../../api/publicMenu/publicMenu.ts').PublicMenuView = {
  restaurant: {
    name: 'Pizzaria do Zé',
    logoUrl: null,
    open: true,
    paused: false,
    nextOpening: null,
    timezone: 'America/Sao_Paulo',
    minOrderCents: 0,
  },
  menu: [],
  cart: { items: [] },
  whatsappUrl: 'https://wa.me/5561999990000?text=oi',
};

const COCA = {
  itemId: 30,
  sizeId: null,
  optionIds: [],
  quantity: 1,
  notes: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  fetchMenu.mockResolvedValue(VIEW);
});

async function mountReady(token = 'tok') {
  const hook = renderHook(() => usePublicMenu(token));
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  return hook;
}

describe('usePublicMenu — carga', () => {
  it('loads the menu by token', async () => {
    const { result } = await mountReady('abc');

    expect(fetchMenu).toHaveBeenCalledWith('abc');
    expect(result.current.view?.restaurant.name).toBe('Pizzaria do Zé');
  });

  // Reabrir o link retoma o que já estava gravado na conversa.
  it('starts with the cart already saved in the conversation', async () => {
    fetchMenu.mockResolvedValue({ ...VIEW, cart: { items: [COCA] } });

    const { result } = await mountReady();

    expect(result.current.lines).toEqual([COCA]);
  });

  it('a bad link ends in the error state with the code', async () => {
    fetchMenu.mockRejectedValue(
      new api.PublicMenuError(401, 'expired_menu_link'),
    );

    const { result } = renderHook(() => usePublicMenu('tok'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorCode).toBe('expired_menu_link');
  });

  it('a network failure is a generic error', async () => {
    fetchMenu.mockRejectedValue(new Error('HTTP 500'));

    const { result } = renderHook(() => usePublicMenu('tok'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorCode).toBe('generic');
  });
});

describe('usePublicMenu — carrinho', () => {
  it('adds lines, and merges an identical line instead of duplicating', async () => {
    const { result } = await mountReady();

    act(() => result.current.addLine(COCA));
    act(() => result.current.addLine({ ...COCA, quantity: 2 }));

    expect(result.current.lines).toEqual([{ ...COCA, quantity: 3 }]);
  });

  it('does not merge lines that differ (other size, options or notes)', async () => {
    const { result } = await mountReady();

    act(() => result.current.addLine(COCA));
    act(() => result.current.addLine({ ...COCA, notes: 'gelada' }));
    act(() => result.current.addLine({ ...COCA, optionIds: [1] }));

    expect(result.current.lines).toHaveLength(3);
  });

  it('caps a line at 50 units', async () => {
    const { result } = await mountReady();

    act(() => result.current.addLine({ ...COCA, quantity: 49 }));
    act(() => result.current.addLine({ ...COCA, quantity: 5 }));

    expect(result.current.lines[0]?.quantity).toBe(50);
  });

  it('changes a quantity, removes at zero, and removes by index', async () => {
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));
    act(() => result.current.addLine({ ...COCA, notes: 'x' }));

    act(() => result.current.setQuantity(0, 4));
    expect(result.current.lines[0]?.quantity).toBe(4);
    act(() => result.current.setQuantity(0, 999));
    expect(result.current.lines[0]?.quantity).toBe(50);
    act(() => result.current.setQuantity(0, 0));
    expect(result.current.lines).toHaveLength(1);
    act(() => result.current.removeLine(0));
    expect(result.current.lines).toEqual([]);
  });
});

describe('usePublicMenu — confirmar', () => {
  const CONFIRMED = {
    lines: [],
    subtotalCents: 1200,
    notified: true,
    whatsappUrl: 'https://wa.me/1',
  };

  it('sends the lines, then exposes the confirmed cart', async () => {
    confirmCart.mockResolvedValue(CONFIRMED);
    const { result } = await mountReady('tok');
    act(() => result.current.addLine(COCA));

    await act(() => result.current.confirm());

    expect(confirmCart).toHaveBeenCalledWith('tok', [COCA]);
    expect(result.current.confirmed).toEqual(CONFIRMED);
    expect(result.current.confirming).toBe(false);
  });

  it('the customer can go back and edit after confirming', async () => {
    confirmCart.mockResolvedValue(CONFIRMED);
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));
    await act(() => result.current.confirm());

    act(() => result.current.reopen());

    expect(result.current.confirmed).toBeNull();
    expect(result.current.lines).toEqual([COCA]);
  });

  // 422: o cliente NÃO perde o que montou; vê o que está errado e ajusta.
  it('a refused cart keeps the lines and reports the problems per line', async () => {
    confirmCart.mockRejectedValue(
      new api.PublicMenuError(422, 'cart_invalid', [
        { code: 'item_unavailable', lineIndex: 0 },
      ]),
    );
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));

    await act(() => result.current.confirm());

    expect(result.current.status).toBe('ready');
    expect(result.current.lines).toEqual([COCA]);
    expect(result.current.failure).toEqual({
      code: 'cart_invalid',
      problems: [{ code: 'item_unavailable', lineIndex: 0 }],
    });
    expect(result.current.confirmed).toBeNull();
  });

  it('refreshes the menu after a refused cart so sold-out items show up', async () => {
    confirmCart.mockRejectedValue(new api.PublicMenuError(422, 'cart_invalid'));
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));
    fetchMenu.mockClear();

    await act(() => result.current.confirm());

    await waitFor(() => expect(fetchMenu).toHaveBeenCalledTimes(1));
  });

  it('a rate limit keeps the cart and reports the code', async () => {
    confirmCart.mockRejectedValue(new api.PublicMenuError(429, 'rate_limited'));
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));

    await act(() => result.current.confirm());

    expect(result.current.status).toBe('ready');
    expect(result.current.failure?.code).toBe('rate_limited');
    expect(result.current.lines).toEqual([COCA]);
  });

  it('a link that expires while the customer shops takes over the screen', async () => {
    confirmCart.mockRejectedValue(
      new api.PublicMenuError(401, 'expired_menu_link'),
    );
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));

    await act(() => result.current.confirm());

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('expired_menu_link');
  });

  it('a network failure while confirming is a generic failure, cart kept', async () => {
    confirmCart.mockRejectedValue(new Error('offline'));
    const { result } = await mountReady();
    act(() => result.current.addLine(COCA));

    await act(() => result.current.confirm());

    expect(result.current.failure).toEqual({ code: 'generic', problems: [] });
    expect(result.current.lines).toEqual([COCA]);
  });

  it('editing the cart clears the previous failure', async () => {
    confirmCart.mockRejectedValue(new api.PublicMenuError(422, 'cart_empty'));
    const { result } = await mountReady();
    await act(() => result.current.confirm());
    expect(result.current.failure).not.toBeNull();

    act(() => result.current.addLine(COCA));

    expect(result.current.failure).toBeNull();
  });
});
