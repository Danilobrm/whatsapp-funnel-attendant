import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { openingLabel } from '../../components/dashboard/format.ts';
import CartSheet from '../../components/publicMenu/CartSheet.tsx';
import ConfirmedScreen from '../../components/publicMenu/ConfirmedScreen.tsx';
import ItemSheet from '../../components/publicMenu/ItemSheet.tsx';
import PublicItemCard, {
  PublicItemCardSkeleton,
} from '../../components/publicMenu/PublicItemCard.tsx';
import { usePublicMenu } from '../../hooks/usePublicMenu/usePublicMenu.ts';
import { useI18n } from '../../i18n/index.tsx';
import { fill } from '../../i18n/fill.ts';
import { displayCart } from '../../lib/cartPricing.ts';
import { formatBRL } from '../../lib/money.ts';
import ItemImage from '../../components/menu/ItemImage/ItemImage.tsx';

import type { PublicItem } from '../../api/publicMenu/publicMenu.ts';

type Selection = number | 'all';

/** Erro que ocupa a tela toda: link inválido/vencido ou falha de carga. */
function LinkError({ code }: { code: string }) {
  const { t } = useI18n();
  const key = `publicMenu.errors.${code}`;
  const text = t(key) === key ? t('publicMenu.errors.loadError') : t(key);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <UtensilsCrossed
        className="h-12 w-12 text-fg-subtle"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h1 className="text-lg font-medium text-fg">
        {t('publicMenu.errors.linkTitle')}
      </h1>
      <p role="alert" className="text-sm text-fg-muted">
        {text}
      </p>
    </main>
  );
}

/**
 * Cardápio em link (`/c/:token`): o cliente que veio do WhatsApp vê fotos,
 * tamanhos e adicionais, monta o carrinho e volta ao chat. Página PÚBLICA —
 * fora do painel, sem login; a credencial é o token da URL. Só código de tema
 * (nada de cor fixa) e mobile-first.
 */
export default function PublicMenu() {
  const { token = '' } = useParams();
  const { t, locale } = useI18n();
  const menu = usePublicMenu(token);
  const [selected, setSelected] = useState<Selection>('all');
  const [openItem, setOpenItem] = useState<PublicItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const categories = useMemo(() => menu.view?.menu ?? [], [menu.view]);
  const cart = useMemo(
    () => displayCart(categories, menu.lines),
    [categories, menu.lines],
  );

  // Ao confirmar, o carrinho fecha: se o cliente voltar para "Alterar itens",
  // cai no cardápio (com a barra do carrinho), não numa folha ainda aberta.
  const confirmedNow = menu.confirmed !== null;
  useEffect(() => {
    if (confirmedNow) setCartOpen(false);
  }, [confirmedNow]);

  if (menu.status === 'error') {
    return <LinkError code={menu.errorCode ?? 'loadError'} />;
  }

  if (menu.confirmed) {
    return (
      <div className="min-h-screen bg-canvas text-fg antialiased">
        <ConfirmedScreen cart={menu.confirmed} onEdit={menu.reopen} />
      </div>
    );
  }

  const loading = menu.status === 'loading';
  const restaurant = menu.view?.restaurant ?? null;
  const visible =
    selected === 'all'
      ? categories
      : categories.filter((c) => c.id === selected);

  let statusText = '';
  let dot = 'bg-fg-subtle';
  if (restaurant) {
    if (restaurant.open) {
      statusText = t('publicMenu.header.open');
      dot = 'bg-success';
    } else if (restaurant.paused) {
      statusText = t('publicMenu.header.paused');
      dot = 'bg-warning';
    } else if (restaurant.nextOpening) {
      statusText = fill(t('publicMenu.header.closedOpens'), {
        when: openingLabel(restaurant.nextOpening, locale, restaurant.timezone),
      });
    } else {
      statusText = t('publicMenu.header.closed');
    }
  }

  return (
    <div className="min-h-screen bg-canvas pb-28 text-fg antialiased">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {/* Logo e nome carregam com a página; enquanto isso, esqueleto NELES. */}
          {restaurant ? (
            <ItemImage
              src={restaurant.logoUrl}
              alt={restaurant.name}
              size="sm"
            />
          ) : (
            <span
              aria-busy="true"
              className="h-14 w-14 flex-none animate-pulse rounded-xl bg-skeleton"
            />
          )}
          <div className="min-w-0">
            {restaurant ? (
              <>
                <h1 className="truncate text-[17px] font-medium text-fg">
                  {restaurant.name}
                </h1>
                <p
                  role="status"
                  className="flex items-center gap-2 text-[13px] text-fg-muted"
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 flex-none rounded-full ${dot}`}
                  />
                  {statusText}
                </p>
              </>
            ) : (
              <span
                aria-busy="true"
                className="block h-5 w-40 animate-pulse rounded bg-skeleton"
              />
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <nav
            aria-label={t('publicMenu.categories.label')}
            className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-3"
          >
            {(['all', ...categories.map((c) => c.id)] as Selection[]).map(
              (value) => {
                const label =
                  value === 'all'
                    ? t('publicMenu.categories.all')
                    : (categories.find((c) => c.id === value)?.name ?? '');
                const active = selected === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(value)}
                    className={`flex-none rounded-full border px-4 py-1.5 text-sm transition ${
                      active
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-line bg-canvas text-fg hover:bg-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              },
            )}
          </nav>
        )}
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5">
        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <PublicItemCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-fg-muted">
            {t('publicMenu.item.empty')}
          </p>
        )}

        {visible.map((category) => (
          <section key={category.id} className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium text-fg">{category.name}</h2>
            {category.items.map((item) => (
              <PublicItemCard
                key={item.id}
                item={item}
                onOpen={() => setOpenItem(item)}
              />
            ))}
          </section>
        ))}
      </main>

      {cart.itemCount > 0 && !cartOpen && !openItem && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas px-4 py-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-[15px] font-medium text-accent-fg"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {t('publicMenu.cart.view')} ·{' '}
              {cart.itemCount === 1
                ? t('publicMenu.cart.oneItem')
                : fill(t('publicMenu.cart.items'), { n: cart.itemCount })}
            </span>
            <span className="tabular-nums">
              {formatBRL(cart.subtotalCents)}
            </span>
          </button>
        </div>
      )}

      {openItem && (
        <ItemSheet
          item={openItem}
          onClose={() => setOpenItem(null)}
          onAdd={menu.addLine}
        />
      )}

      {cartOpen && (
        <CartSheet
          cart={cart}
          minOrderCents={restaurant?.minOrderCents ?? 0}
          confirming={menu.confirming}
          failure={menu.failure}
          onQuantity={menu.setQuantity}
          onRemove={menu.removeLine}
          onConfirm={() => void menu.confirm()}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
