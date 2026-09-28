import { describe, expect, it } from 'vitest';

import { formatBRL, parseBRLInput } from './money.ts';

describe('formatBRL', () => {
  it('formata centavos como moeda pt-BR', () => {
    expect(formatBRL(4500)).toBe('R$ 45,00');
  });

  it('formata milhar com ponto', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('parseBRLInput', () => {
  it('lê inteiro sem decimais', () => {
    expect(parseBRLInput('45')).toBe(4500);
  });

  it('lê vírgula decimal', () => {
    expect(parseBRLInput('45,50')).toBe(4550);
  });

  it('ignora "R$" e espaços, lê separador de milhar', () => {
    expect(parseBRLInput('R$ 1.234,56')).toBe(123456);
  });

  it('null para texto vazio', () => {
    expect(parseBRLInput('')).toBeNull();
  });

  it('null para texto sem dígitos', () => {
    expect(parseBRLInput('abc')).toBeNull();
  });
});
