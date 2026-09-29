import { Store as StoreIcon } from 'lucide-react';
import { Outlet } from 'react-router-dom';

import { useT } from '../../../i18n/index.tsx';
import StoreTabs from '../StoreTabs/StoreTabs.tsx';

/**
 * Casca de `/admin/store/*`: título e abas ficam parados no topo e só o
 * conteúdo da aba (o `<Outlet />`) troca — a barra de abas não pula de altura
 * entre Geral, Horários e Pagamento. Cada aba segue com o próprio fetch/autosave.
 */
export default function StoreLayout() {
  const t = useT();

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
            <StoreIcon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-xl font-medium text-fg">{t('store.title')}</h1>
            <p className="text-sm text-fg-muted">{t('store.subtitle')}</p>
          </div>
        </header>

        <StoreTabs />

        <Outlet />
      </main>
    </div>
  );
}
