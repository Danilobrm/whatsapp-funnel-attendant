/**
 * Menu de barra do composer.
 *
 * No simulador (`/admin/simulator`), `/` abre os comandos do painel — ações
 * sobre a conversa de teste, que nunca são enviadas ao atendente.
 * `buildQuestionCommands` cobre o outro uso: sugestões de mensagem prontas
 * (ex.: itens do cardápio), onde escolher envia o texto em linguagem natural.
 *
 * Um item traz ou chaves de i18n (`labelKey`/`descriptionKey`, texto fixo do
 * produto) ou texto já resolvido (`label`/`description`, dado dinâmico). Nunca
 * os dois.
 */
export type ChatCommandId = 'reset';

export interface ChatCommand {
  id: string;
  /** Texto casado enquanto o usuário digita. Sempre começa com `/`. */
  trigger: string;
  /** Texto enviado ao escolher o item. Default: o próprio `trigger`. */
  submit?: string;
  /**
   * Se presente, escolher o item NÃO envia — preenche o composer com este
   * texto e mantém o menu aberto (para menus em cascata).
   */
  expand?: string;
  labelKey?: string;
  descriptionKey?: string;
  label?: string;
  description?: string;
  /**
   * Casa por conteúdo (`includes`), não por prefixo do trigger. É o que deixa
   * `/calabresa` achar "Pizza de calabresa grande".
   */
  searchText?: string;
}

/** minúsculas + sem acento — casamento não pode depender de "ç" ou "ã". */
function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    id: 'reset',
    trigger: '/reiniciar',
    labelKey: 'chat.commands.reset.label',
    descriptionKey: 'chat.commands.reset.description',
  },
] as const;

export function isCommandInput(value: string, prefix = '/'): boolean {
  return value.trimStart().startsWith(prefix);
}

/**
 * Itens cujo gatilho começa com o texto digitado — mais, para quem declara
 * `searchText`, os que contêm o termo digitado depois do prefixo.
 *
 * `prefix` permite usar outro caractere (ex.: `?`) para um segundo menu —
 * mesmo mecanismo. `/` fica reservado para comandos do painel.
 */
export function matchCommands(
  value: string,
  commands: readonly ChatCommand[] = CHAT_COMMANDS,
  prefix = '/',
): ChatCommand[] {
  const typed = normalize(value);
  if (!typed.startsWith(prefix)) return [];
  const term = typed.slice(prefix.length);

  return commands.filter((command) => {
    if (normalize(command.trigger).startsWith(typed)) return true;
    if (!command.searchText || term.length === 0) return false;
    return normalize(command.searchText).includes(term);
  });
}

/** Comando exato para um texto submetido. `null` quando não existe. */
export function resolveCommand(
  value: string,
  commands: readonly ChatCommand[] = CHAT_COMMANDS,
): ChatCommand | null {
  const typed = value.trim().toLowerCase();
  return commands.find((command) => command.trigger === typed) ?? null;
}

/** prefix + slug da pergunta — o gatilho existe só para o casamento. */
function questionTrigger(question: string, prefix: string): string {
  const slug = normalize(question)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `${prefix}${slug}`;
}

export interface QuestionSuggestion {
  id: number | string;
  question: string;
}

/**
 * Textos prontos viram itens do menu: digita o gatilho, filtra e escolhe. Ao
 * escolher, o enviado é o texto em si — o backend continua recebendo
 * linguagem natural, não um comando.
 */
export function buildQuestionCommands(
  questions: readonly QuestionSuggestion[],
  limit = 8,
  prefix = '/',
): ChatCommand[] {
  const seen = new Set<string>();
  const out: ChatCommand[] = [];

  for (const item of questions) {
    const question = item.question.trim();
    if (question.length === 0) continue;

    const key = normalize(question);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: `q-${item.id}`,
      trigger: questionTrigger(question, prefix),
      submit: question,
      label: question,
      searchText: question,
    });

    if (out.length >= limit) break;
  }

  return out;
}
