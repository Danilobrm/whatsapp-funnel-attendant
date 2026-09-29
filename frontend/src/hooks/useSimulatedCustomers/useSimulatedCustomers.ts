import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createSimulatedCustomer,
  fetchSimulatedCustomers,
  type SimulatedCustomer,
} from '../../api/simulator/simulator.ts';

/**
 * Clientes de teste do simulador (nome + telefone fictício). Cada um é uma
 * conversa própria — é o que permite testar cliente recorrente e vários
 * pedidos simultâneos sem WhatsApp. A lista é conveniência: se falhar ao
 * carregar, o simulador segue com o cliente padrão.
 */
export function useSimulatedCustomers() {
  const [customers, setCustomers] = useState<SimulatedCustomer[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchSimulatedCustomers()
      .then((items) => {
        if (mounted.current) setCustomers(items);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Cria e devolve o cliente. Erro (422 `SimulatorRejectedError`) propaga
   * para o formulário, que mostra o `code` via i18n.
   */
  const create = useCallback(async (input: { name: string; phone: string }) => {
    const customer = await createSimulatedCustomer(input);
    if (mounted.current) {
      setCustomers((prev) =>
        prev.some((c) => c.contactId === customer.contactId)
          ? prev.map((c) => (c.contactId === customer.contactId ? customer : c))
          : [...prev, customer],
      );
    }
    return customer;
  }, []);

  return { customers, create };
}
