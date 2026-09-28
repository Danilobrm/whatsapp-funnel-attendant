import { describe, expect, it } from 'vitest';

import {
  intervalSegments,
  labelToMinutes,
  minutesToLabel,
  minutesToPercent,
  positionToMinutes,
  positionToMinutesWrapped,
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

describe('minutesToPercent', () => {
  it('mapeia 0..1440 para 0..100', () => {
    expect(minutesToPercent(0)).toBe(0);
    expect(minutesToPercent(720)).toBe(50);
    expect(minutesToPercent(1440)).toBe(100);
  });

  it('satura fora da faixa', () => {
    expect(minutesToPercent(-10)).toBe(0);
    expect(minutesToPercent(2000)).toBe(100);
  });
});

describe('positionToMinutes', () => {
  it('converte posição do ponteiro relativa à trilha', () => {
    // trilha de 0 a 300px representa 0 a 1440min.
    expect(positionToMinutes(0, 0, 300)).toBe(0);
    expect(positionToMinutes(150, 0, 300)).toBe(720);
    expect(positionToMinutes(300, 0, 300)).toBe(1440);
  });

  it('satura fora da trilha', () => {
    expect(positionToMinutes(-50, 0, 300)).toBe(0);
    expect(positionToMinutes(999, 0, 300)).toBe(1440);
  });

  it('considera o offset da trilha (trackLeft)', () => {
    expect(positionToMinutes(100, 100, 300)).toBe(0);
  });

  it('devolve 0 quando a trilha ainda não foi medida', () => {
    expect(positionToMinutes(150, 0, 0)).toBe(0);
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

describe('positionToMinutesWrapped', () => {
  it('converte normalmente dentro da trilha', () => {
    expect(positionToMinutesWrapped(0, 0, 300)).toBe(0);
    expect(positionToMinutesWrapped(150, 0, 300)).toBe(720);
  });

  it('continua além do fim da trilha e dobra pro início (cruza meia-noite)', () => {
    // 330px numa trilha de 300px = 110% do dia = 1584min -> dobra pra 144min (02:24).
    expect(positionToMinutesWrapped(330, 0, 300)).toBe(
      snapToStep(wrapMinutes(1.1 * 24 * 60)),
    );
  });

  it('continua antes do início da trilha e dobra pro fim', () => {
    expect(positionToMinutesWrapped(-30, 0, 300)).toBe(
      snapToStep(wrapMinutes(-0.1 * 24 * 60)),
    );
  });

  it('devolve 0 quando a trilha ainda não foi medida', () => {
    expect(positionToMinutesWrapped(150, 0, 0)).toBe(0);
  });
});

describe('intervalSegments', () => {
  it('intervalo normal vira um segmento só', () => {
    expect(intervalSegments(11 * 60, 15 * 60)).toEqual([
      { left: minutesToPercent(11 * 60), width: minutesToPercent(4 * 60) },
    ]);
  });

  it('intervalo cruzando meia-noite vira dois segmentos', () => {
    const segments = intervalSegments(18 * 60, 2 * 60);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      left: minutesToPercent(18 * 60),
      width: minutesToPercent(6 * 60),
    });
    expect(segments[1]).toEqual({ left: 0, width: minutesToPercent(2 * 60) });
  });

  it('fim exatamente em 00:00 (minutos 0) não gera segundo segmento vazio', () => {
    const segments = intervalSegments(18 * 60, 0);
    expect(segments).toHaveLength(1);
  });
});
