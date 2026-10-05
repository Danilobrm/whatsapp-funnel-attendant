import { describe, expect, it } from 'vitest';

import {
  labelToMinutes,
  minutesToLabel,
  snapToStep,
  wrapMinutes,
} from './timeSlots.ts';

describe('minutesToLabel', () => {
  it('formata HH:MM com zero à esquerda', () => {
    expect(minutesToLabel(0)).toBe('00:00');
    expect(minutesToLabel(65)).toBe('01:05');
    expect(minutesToLabel(1439)).toBe('23:59');
  });

  it('1440 (meia-noite do fim do dia) vira 00:00, não 24:00', () => {
    expect(minutesToLabel(1440)).toBe('00:00');
  });
});

describe('labelToMinutes', () => {
  it('é o inverso de minutesToLabel para valores do dia', () => {
    expect(labelToMinutes('18:30')).toBe(18 * 60 + 30);
    expect(labelToMinutes('00:00')).toBe(0);
  });
});

describe('snapToStep', () => {
  it('arredonda para o step de 15min', () => {
    expect(snapToStep(7)).toBe(0);
    expect(snapToStep(8)).toBe(15);
    expect(snapToStep(22)).toBe(15);
    expect(snapToStep(23)).toBe(30);
  });
});

describe('wrapMinutes', () => {
  it('mantém valores já dentro do dia', () => {
    expect(wrapMinutes(0)).toBe(0);
    expect(wrapMinutes(720)).toBe(720);
    expect(wrapMinutes(1439)).toBe(1439);
  });

  it('dobra valores acima de 1440 pro início do dia', () => {
    expect(wrapMinutes(1440)).toBe(0);
    expect(wrapMinutes(1500)).toBe(60);
  });

  it('dobra valores negativos pro fim do dia', () => {
    expect(wrapMinutes(-60)).toBe(1380);
  });
});
