import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PublicMenuError,
  confirmPublicCart,
  fetchPublicMenu,
  type CartLine,
  type CartProblem,
  type ConfirmedCart,
  type PublicMenuView,
} from '../../api/publicMenu/publicMenu.ts';
import { MAX_LINE_QUANTITY, sameLine } from '../../lib/cartPricing.ts';

export type PublicMenuStatus = 'loading' | 'ready' | 'error';

/** Falha ao confirmar: o `code` vira texto por i18n; `problems` aponta as linhas. */
export interface ConfirmFailure {
  code: string;
  problems: CartProblem[];
}

function codeOf(err: unknown): string {
  return err instanceof PublicMenuError ? err.code : 'generic';
}

/**
 * Estado da página do cardápio em link: carrega o cardápio pelo token, guarda
 * o carrinho (só ids e quantidade), e confirma no servidor. O carrinho que já
 * estava gravado na conversa volta preenchido — reabrir o link retoma.
 *
 * Só erro de LINK (401) e de carga ocupam a tela toda; um 422/429 ao confirmar
 * fica no carrinho, com o que o cliente montou intacto.
 */
export function usePublicMenu(token: string) {
  const [status, setStatus] = useState<PublicMenuStatus>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [view, setView] = useState<PublicMenuView | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedCart | null>(null);
  const [failure, setFailure] = useState<ConfirmFailure | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let current = true;
    setStatus('loading');
    setErrorCode(null);
    setView(null);
    setLines([]);
    setConfirmed(null);
    setFailure(null);

    fetchPublicMenu(token)
      .then((result) => {
        if (!mounted.current || !current) return;
        setView(result);
        setLines(result.cart.items);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!mounted.current || !current) return;
        setErrorCode(codeOf(err));
        setStatus('error');
      });

    return () => {
      current = false;
      mounted.current = false;
    };
  }, [token]);

  /** Soma na linha igual (mesmo item, tamanho, opções e nota) em vez de duplicar. */
  const addLine = useCallback((line: CartLine) => {
    setFailure(null);
    setLines((prev) => {
      const index = prev.findIndex((l) => sameLine(l, line));
      if (index === -1) return [...prev, line];
      return prev.map((l, i) =>
        i === index
          ? {
              ...l,
              quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + line.quantity),
            }
          : l,
      );
    });
  }, []);

  const setQuantity = useCallback((index: number, quantity: number) => {
    setFailure(null);
    setLines((prev) =>
      quantity < 1
        ? prev.filter((_, i) => i !== index)
        : prev.map((l, i) =>
            i === index
              ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) }
              : l,
          ),
    );
  }, []);

  const removeLine = useCallback((index: number) => {
    setFailure(null);
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const confirm = useCallback(async () => {
    setConfirming(true);
    setFailure(null);
    try {
      const result = await confirmPublicCart(token, lines);
      if (!mounted.current) return;
      setConfirmed(result);
    } catch (err) {
      if (!mounted.current) return;
      // Link vencido/adulterado: não há mais o que fazer nesta tela.
      if (err instanceof PublicMenuError && err.status === 401) {
        setErrorCode(err.code);
        setStatus('error');
        return;
      }
      setFailure({
        code: codeOf(err),
        problems: err instanceof PublicMenuError ? err.problems : [],
      });
      // Item esgotou / saiu do cardápio: recarrega para a tela refletir.
      if (err instanceof PublicMenuError && err.code === 'cart_invalid') {
        fetchPublicMenu(token)
          .then((fresh) => {
            if (mounted.current) setView(fresh);
          })
          .catch(() => undefined);
      }
    } finally {
      if (mounted.current) setConfirming(false);
    }
  }, [token, lines]);

  /** Volta do "carrinho enviado" para editar os itens. */
  const reopen = useCallback(() => setConfirmed(null), []);

  return {
    status,
    errorCode,
    view,
    lines,
    confirming,
    confirmed,
    failure,
    addLine,
    setQuantity,
    removeLine,
    confirm,
    reopen,
  };
}
