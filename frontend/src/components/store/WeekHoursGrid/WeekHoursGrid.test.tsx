import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, renderWithProviders, screen } from '../../../test/render.tsx';
import WeekHoursGrid from './WeekHoursGrid.tsx';

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

  it('um intervalo cruzando meia-noite vira dois blocos', () => {
    renderWithProviders(
      <WeekHoursGrid value={{ sat: [['22:00', '02:00']] }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('block-sat-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('block-sat-0-1')).toBeInTheDocument();
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

  it('End no handle de fim cruza a meia-noite (dobra pra 00:00)', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ mon: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    screen.getByTestId('handle-mon-0-end').focus();
    await userEvent.keyboard('{End}');

    expect(onChange).toHaveBeenCalledWith({ mon: [['11:00', '00:00']] });
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
    fireEvent.mouseDown(column, { clientY: 11 * 60 });
    fireEvent.mouseMove(window, { clientY: 15 * 60 });
    fireEvent.mouseUp(window, { clientY: 15 * 60 });

    expect(onChange).toHaveBeenCalledWith({ thu: [['11:00', '15:00']] });
  });

  it('um arraste curto (clique acidental) não cria intervalo', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(<WeekHoursGrid value={{}} onChange={onChange} />);

    const column = screen.getByTestId('week-hours-column-thu');
    fireEvent.mouseDown(column, { clientY: 11 * 60 });
    fireEvent.mouseUp(window, { clientY: 11 * 60 + 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrastar o corpo do bloco move o intervalo inteiro', () => {
    mockGridRect();
    const onChange = vi.fn();
    renderWithProviders(
      <WeekHoursGrid value={{ fri: [['11:00', '15:00']] }} onChange={onChange} />,
    );

    const block = screen.getByTestId('block-fri-0-0');
    fireEvent.mouseDown(block, { clientY: 11 * 60 });
    fireEvent.mouseMove(window, { clientY: 12 * 60 });
    fireEvent.mouseUp(window, { clientY: 12 * 60 });

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
    fireEvent.mouseMove(window, { clientY: 10 * 60 });
    fireEvent.mouseUp(window, { clientY: 10 * 60 });

    expect(onChange).toHaveBeenCalledWith({ fri: [['10:00', '15:00']] });
  });
});
