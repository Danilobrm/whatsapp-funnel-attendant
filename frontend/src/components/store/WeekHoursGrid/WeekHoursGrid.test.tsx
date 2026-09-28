import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, renderWithProviders, screen } from '../../../test/render.tsx';
import WeekHoursGrid from './WeekHoursGrid.tsx';

/**
 * A grade começa às 10h (ver `DAY_START_MINUTES` no componente), não à meia-
 * noite — pixel 0 é 10:00 real. Com a trilha mockada em 1440px (1px/min),
 * `realY(11, 0)` devolve o `clientY` cujo horário REAL é 11:00.
 */
function realY(hour: number, minute = 0): number {
  return (((hour * 60 + minute - 10 * 60) % 1440) + 1440) % 1440;
}

/** Trilha de 1440px = 1px por minuto, sem arredondamento pra facilitar as contas do teste. */
function mockGridRect() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 300,
    width: 300,
    top: 0,
    bottom: 1440,
    height: 1440,
    x: 0,
    y: 0,
    toJSON: () => '',
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('WeekHoursGrid — layout', () => {
  it('renderiza os 7 dias da semana', () => {
    renderWithProviders(<WeekHoursGrid value={{}} onChange={vi.fn()} />);

    for (const label of ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('mostra o intervalo existente com o rótulo de horário', () => {
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={vi.fn()} />,
    );
    expect(screen.getByText('11:00–15:00')).toBeInTheDocument();
  });

  it('um intervalo cruzando o início da grade (10:00) vira dois blocos', () => {
    // A grade começa às 10:00 — 22:00–02:00 não cruza mais essa borda (fica
    // como um bloco contínuo, já que a meia-noite real agora é "meio da grade").
    // Quem cruza é um intervalo que atravessa as 10:00, como 08:00–12:00.
    renderWithProviders(
      <WeekHoursGrid value={{ sat: [['08:00', '12:00']] }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('block-sat-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('block-sat-0-1')).toBeInTheDocument();
  });

  it('um intervalo que cruza a meia-noite real fica como um bloco só', () => {
    renderWithProviders(
      <WeekHoursGrid value={{ sat: [['22:00', '02:00']] }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('block-sat-0-0')).toBeInTheDocument();
    expect(screen.queryByTestId('block-sat-0-1')).not.toBeInTheDocument();
  });
});

describe('WeekHoursGrid — teclado', () => {
  it('ArrowUp no handle de início recua 15min', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    screen.getByTestId('handle-mon-0-start').focus();
    await userEvent.keyboard('{ArrowUp}');

    expect(onChange).toHaveBeenCalledWith({ mon: [['10:45', '15:00']] });
  });

  it('ArrowDown no handle de fim avança 15min', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    screen.getByTestId('handle-mon-0-end').focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(onChange).toHaveBeenCalledWith({ mon: [['11:00', '15:15']] });
  });

  it('End no handle de fim vai pra borda da grade (10:00)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    screen.getByTestId('handle-mon-0-end').focus();
    await userEvent.keyboard('{End}');

    expect(onChange).toHaveBeenCalledWith({ mon: [['11:00', '10:00']] });
  });

  it('não reage ao teclado quando desabilitado', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={onChange} disabled />,
    );

    screen.getByTestId('handle-mon-0-start').focus();
    await userEvent.keyboard('{ArrowUp}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('WeekHoursGrid — adicionar e remover', () => {
  it('o botão "+" do cabeçalho adiciona um intervalo padrão só naquele dia', async () => {
    const onChange = vi.fn();
    renderWithProviders(<WeekHoursGrid value={{}} onChange={onChange} />);

    await userEvent.click(screen.getByTestId('add-tue'));

    expect(onChange).toHaveBeenCalledWith({ tue: [['11:00', '15:00']] });
  });

  it('remover o único intervalo do dia apaga a chave (fica fechado)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ wed: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    await userEvent.click(screen.getByTestId('remove-wed-0'));

    expect(onChange).toHaveBeenCalledWith({});
  });
});

describe('WeekHoursGrid — arrastar', () => {
  it('arrastar numa área vazia da coluna cria um intervalo novo', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(<WeekHoursGrid value={{}} onChange={onChange} />);

    const column = screen.getByTestId('week-hours-column-thu');
    fireEvent.mouseDown(column, { clientY: realY(11) });
    fireEvent.mouseMove(window, { clientY: realY(15) });
    fireEvent.mouseUp(window, { clientY: realY(15) });

    expect(onChange).toHaveBeenCalledWith({ thu: [['11:00', '15:00']] });
  });

  it('um arraste curto (clique acidental) não cria intervalo', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(<WeekHoursGrid value={{}} onChange={onChange} />);

    const column = screen.getByTestId('week-hours-column-thu');
    fireEvent.mouseDown(column, { clientY: realY(11) });
    fireEvent.mouseUp(window, { clientY: realY(11) + 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrastar o corpo do bloco move o intervalo inteiro', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ fri: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    const block = screen.getByTestId('block-fri-0-0');
    fireEvent.mouseDown(block, { clientY: realY(11) });
    fireEvent.mouseMove(window, { clientY: realY(12) });
    fireEvent.mouseUp(window, { clientY: realY(12) });

    expect(onChange).toHaveBeenCalledWith({ fri: [['12:00', '16:00']] });
  });

  it('arrastar o handle de início ajusta só o início', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ fri: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    const handle = screen.getByTestId('handle-fri-0-start');
    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(window, { clientY: realY(10) });
    fireEvent.mouseUp(window, { clientY: realY(10) });

    expect(onChange).toHaveBeenCalledWith({ fri: [['10:00', '15:00']] });
  });
});
