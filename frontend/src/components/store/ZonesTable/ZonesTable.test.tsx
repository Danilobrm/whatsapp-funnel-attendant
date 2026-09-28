import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';
import ZonesTable from './ZonesTable.tsx';

import type { DeliveryZone } from '../../../api/store';

const ZONES: DeliveryZone[] = [
  { id: 1, neighborhood: 'Centro', feeCents: 500, active: true },
];

describe('ZonesTable', () => {
  it('shows the empty state with no zones', () => {
    renderWithProviders(
      <ZonesTable zones={[]} onAdd={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText('Nenhuma zona cadastrada ainda.')).toBeInTheDocument();
  });

  it('lists the existing zones with their fee', () => {
    renderWithProviders(
      <ZonesTable zones={ZONES} onAdd={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByDisplayValue('Centro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5,00')).toBeInTheDocument();
  });

  it('adds a new zone once neighborhood and fee are filled', async () => {
    const onAdd = vi.fn();
    renderWithProviders(
      <ZonesTable zones={[]} onAdd={onAdd} onUpdate={vi.fn()} onDelete={vi.fn()} />,
    );

    await userEvent.type(
      screen.getByPlaceholderText('Bairro (ex.: Centro)'),
      'Vila Mariana',
    );
    await userEvent.type(screen.getByPlaceholderText('0,00'), '7,00');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(onAdd).toHaveBeenCalledWith({
      neighborhood: 'Vila Mariana',
      feeCents: 700,
      active: true,
    });
  });

  it('calls onDelete for the right zone', async () => {
    const onDelete = vi.fn();
    renderWithProviders(
      <ZonesTable zones={ZONES} onAdd={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Excluir zona' }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
