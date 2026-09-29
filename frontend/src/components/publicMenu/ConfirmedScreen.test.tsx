import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';
import ConfirmedScreen from './ConfirmedScreen.tsx';

import type { ConfirmedCart } from '../../api/publicMenu/publicMenu.ts';

const CART: ConfirmedCart = {
  lines: [
    { name: 'Pizza', sizeName: 'Grande', quantity: 1, totalCents: 6850 },
    { name: 'Coca 2L', sizeName: null, quantity: 2, totalCents: 2400 },
  ],
  subtotalCents: 9250,
  notified: true,
  whatsappUrl: 'https://wa.me/5561999990000?text=Montei',
};

describe('ConfirmedScreen', () => {
  it('confirms the cart is sent and lists what was confirmed, with the subtotal', () => {
    renderWithProviders(<ConfirmedScreen cart={CART} onEdit={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Carrinho enviado!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1x Pizza Grande')).toBeInTheDocument();
    expect(screen.getByText('2x Coca 2L')).toBeInTheDocument();
    expect(screen.getByText('R$ 92,50')).toBeInTheDocument();
    expect(
      screen.getByText(/Volte ao WhatsApp para continuar: entrega, pagamento/),
    ).toBeInTheDocument();
  });

  it('"Voltar ao WhatsApp" is a link to the wa.me URL from the server', () => {
    renderWithProviders(<ConfirmedScreen cart={CART} onEdit={vi.fn()} />);

    expect(
      screen.getByRole('link', { name: 'Voltar ao WhatsApp' }),
    ).toHaveAttribute('href', 'https://wa.me/5561999990000?text=Montei');
  });

  it('without a WhatsApp URL (simulator / no number) it only asks to go back to the chat', () => {
    renderWithProviders(
      <ConfirmedScreen
        cart={{ ...CART, whatsappUrl: null }}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.getByText('Abra a conversa do WhatsApp para continuar.'),
    ).toBeInTheDocument();
  });

  // O carrinho está salvo, mas a mensagem no chat falhou: o cliente precisa saber.
  it('when the chat notice failed, tells the customer to send a message', () => {
    renderWithProviders(
      <ConfirmedScreen cart={{ ...CART, notified: false }} onEdit={vi.fn()} />,
    );

    expect(
      screen.getByText(
        'Volte ao WhatsApp e mande uma mensagem para a gente continuar.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Volte ao WhatsApp para continuar:/),
    ).not.toBeInTheDocument();
  });

  it('lets the customer change the items', async () => {
    const onEdit = vi.fn();
    renderWithProviders(<ConfirmedScreen cart={CART} onEdit={onEdit} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Alterar itens' }),
    );

    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
