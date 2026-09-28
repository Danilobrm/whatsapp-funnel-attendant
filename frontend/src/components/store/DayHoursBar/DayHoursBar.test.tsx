import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, renderWithProviders, screen } from '../../../test/render.tsx';
import DayHoursBar from './DayHoursBar.tsx';

import type { DayInterval } from '../../../api/store';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('DayHoursBar — estado', () => {
  it('mostra "Fechado" sem intervalos', () => {
    renderWithProviders(
      <DayHoursBar dayLabel="Segunda" intervals={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText('Fechado')).toBeInTheDocument();
  });

  it('mostra o intervalo existente como um chip', () => {
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('11:00 – 15:00')).toBeInTheDocument();
  });
});

describe('DayHoursBar — adicionar e remover', () => {
  it('adiciona um intervalo padrão', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar dayLabel="Segunda" intervals={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar intervalo' }));

    expect(onChange).toHaveBeenCalledWith([['11:00', '15:00']]);
  });

  it('remove o intervalo certo', async () => {
    const onChange = vi.fn();
    const intervals: DayInterval[] = [
      ['11:00', '15:00'],
      ['18:00', '23:00'],
    ];
    renderWithProviders(
      <DayHoursBar dayLabel="Segunda" intervals={intervals} onChange={onChange} />,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Remover intervalo' })[1]!);

    expect(onChange).toHaveBeenCalledWith([['11:00', '15:00']]);
  });
});

describe('DayHoursBar — teclado', () => {
  it('ArrowRight no handle de início avança 15min', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={onChange}
      />,
    );

    const handle = screen.getByTestId('handle-0-start');
    handle.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith([['11:15', '15:00']]);
  });

  it('ArrowLeft no handle de fim recua 15min', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={onChange}
      />,
    );

    const handle = screen.getByTestId('handle-0-end');
    handle.focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(onChange).toHaveBeenCalledWith([['11:00', '14:45']]);
  });

  it('Home leva o handle para 00:00', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={onChange}
      />,
    );

    screen.getByTestId('handle-0-start').focus();
    await userEvent.keyboard('{Home}');

    expect(onChange).toHaveBeenCalledWith([['00:00', '15:00']]);
  });

  it('não reage ao teclado quando desabilitado', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={onChange}
        disabled
      />,
    );

    screen.getByTestId('handle-0-start').focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DayHoursBar — arrastar', () => {
  it('arrastar o handle de início até o meio da trilha ajusta para 12:00', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 300,
      width: 300,
      top: 0,
      bottom: 40,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => '',
    });

    const onChange = vi.fn();
    renderWithProviders(
      <DayHoursBar
        dayLabel="Segunda"
        intervals={[['11:00', '15:00']]}
        onChange={onChange}
      />,
    );

    const handle = screen.getByTestId('handle-0-start');
    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    expect(onChange).toHaveBeenCalledWith([['12:00', '15:00']]);
  });
});
