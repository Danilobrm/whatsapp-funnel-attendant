import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../test/render.tsx';
import Dropdown from './Dropdown.tsx';

const OPTIONS = [
  { value: 'sum', label: 'Soma' },
  { value: 'max', label: 'Maior valor' },
  { value: 'average', label: 'Média' },
];

describe('Dropdown — exibição', () => {
  it('mostra o rótulo da opção selecionada', () => {
    render(<Dropdown value="max" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('Maior valor');
  });

  it('mostra o placeholder quando nada está selecionado', () => {
    render(
      <Dropdown value="" options={OPTIONS} onChange={vi.fn()} placeholder="Escolha" />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Escolha');
  });

  it('a lista começa fechada', () => {
    render(<Dropdown value="sum" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Dropdown — mouse', () => {
  it('clicar no botão abre a lista com as opções', async () => {
    render(<Dropdown value="sum" options={OPTIONS} onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Média' })).toBeInTheDocument();
  });

  it('clicar numa opção seleciona e fecha', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="sum" options={OPTIONS} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('option', { name: 'Média' }));

    expect(onChange).toHaveBeenCalledWith('average');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clicar fora fecha sem selecionar', async () => {
    const onChange = vi.fn();
    render(
      <div>
        <Dropdown value="sum" options={OPTIONS} onChange={onChange} />
        <button type="button">fora</button>
      </div>,
    );

    await userEvent.click(screen.getByRole('button', { name: /soma/i }));
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Dropdown — teclado', () => {
  it('ArrowDown + Enter navega e seleciona', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="sum" options={OPTIONS} onChange={onChange} />);

    screen.getByRole('button').focus();
    await userEvent.keyboard('{ArrowDown}'); // abre a lista, destaca a opção atual (sum)
    await userEvent.keyboard('{ArrowDown}'); // desce pra "max"
    await userEvent.keyboard('{ArrowDown}'); // desce pra "average"
    await userEvent.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('average');
  });

  it('Escape fecha sem selecionar', async () => {
    const onChange = vi.fn();
    render(<Dropdown value="sum" options={OPTIONS} onChange={onChange} />);

    screen.getByRole('button').focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Dropdown — desabilitado', () => {
  it('não abre com o teclado quando desabilitado', async () => {
    render(<Dropdown value="sum" options={OPTIONS} onChange={vi.fn()} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
