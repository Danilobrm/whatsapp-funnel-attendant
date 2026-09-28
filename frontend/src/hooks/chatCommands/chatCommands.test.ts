import { describe, expect, it } from 'vitest';

import {
  CHAT_COMMANDS,
  buildQuestionCommands,
  isCommandInput,
  matchCommands,
  resolveCommand,
} from './chatCommands.ts';

describe('isCommandInput', () => {
  it('detects a slash at the start', () => {
    expect(isCommandInput('/pend')).toBe(true);
    expect(isCommandInput('   /pend')).toBe(true);
  });

  it('ignores a slash anywhere else', () => {
    expect(isCommandInput('e/ou')).toBe(false);
    expect(isCommandInput('qual o prazo?')).toBe(false);
  });
});

describe('matchCommands', () => {
  it('lists every command for a bare slash', () => {
    expect(matchCommands('/')).toEqual([...CHAT_COMMANDS]);
  });

  it('filters by prefix, case-insensitively', () => {
    expect(matchCommands('/REIN').map((c) => c.id)).toEqual(['reset']);
  });

  it('exposes every panel command', () => {
    expect(matchCommands('/').map((c) => c.id)).toEqual(['reset']);
  });

  it('returns nothing for a non-command', () => {
    expect(matchCommands('reiniciar')).toEqual([]);
  });

  it('returns nothing when no trigger matches', () => {
    expect(matchCommands('/zzz')).toEqual([]);
  });
});

describe('buildQuestionCommands', () => {
  const questions = [
    { id: 1, question: 'Como rastrear meu pedido?' },
    { id: 2, question: 'Quais formas de pagamento são aceitas?' },
  ];

  it('sends the question itself, not the trigger', () => {
    const [first] = buildQuestionCommands(questions);

    expect(first?.submit).toBe('Como rastrear meu pedido?');
    expect(first?.label).toBe('Como rastrear meu pedido?');
    expect(first?.trigger.startsWith('/')).toBe(true);
  });

  it('drops blanks and repeated questions', () => {
    const commands = buildQuestionCommands([
      { id: 1, question: 'Aceitam Pix?' },
      { id: 2, question: '  aceitam pix?  ' },
      { id: 3, question: '   ' },
    ]);

    expect(commands).toHaveLength(1);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      question: `Pergunta ${i}?`,
    }));

    expect(buildQuestionCommands(many, 5)).toHaveLength(5);
  });

  it('matches by content, accent-insensitively', () => {
    const commands = buildQuestionCommands(questions);

    expect(matchCommands('/', commands)).toHaveLength(2);
    expect(matchCommands('/pagamento', commands).map((c) => c.id)).toEqual([
      'q-2',
    ]);
    expect(matchCommands('/sao aceitas', commands).map((c) => c.id)).toEqual([
      'q-2',
    ]);
    expect(matchCommands('/entrega', commands)).toEqual([]);
  });

  it('keeps panel commands on prefix matching only', () => {
    // "/i" não pode listar /reiniciar só porque a palavra contém um "i".
    expect(matchCommands('/i')).toEqual([]);
  });
});

describe('resolveCommand', () => {
  it('resolves only an exact trigger', () => {
    expect(resolveCommand('/reiniciar')?.id).toBe('reset');
    expect(resolveCommand('  /Reiniciar  ')?.id).toBe('reset');
  });

  it('does not resolve a partial trigger', () => {
    expect(resolveCommand('/rein')).toBeNull();
  });

  it('does not resolve plain text', () => {
    expect(resolveCommand('quais formas de pagamento?')).toBeNull();
  });
});
