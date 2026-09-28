import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, UtensilsCrossed } from 'lucide-react';

import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  fetchMenu,
  reorderCategories,
  reorderItems,
  setItemAvailability,
  updateCategory,
  updateItem,
  type Menu as MenuData,
  type MenuCategory,
  type MenuItem,
  type MenuItemFormInput,
} from '../../api/menu';
import ItemDrawer from '../../components/menu/ItemDrawer';
import ItemRow, { ItemRowSkeleton } from '../../components/menu/ItemRow';
import { useT } from '../../i18n/index.tsx';

function reorderedIds<T extends { id: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): number[] | null {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (!moved) return null;
  next.splice(target, 0, moved);
  return next.map((i) => i.id);
}

function MenuSkeleton() {
  return (
    <div aria-busy="true" data-testid="menu-skeleton" className="flex flex-col gap-6">
      {[0, 1].map((section) => (
        <section key={section} className="rounded-2xl border border-line bg-surface p-6">
          <div className="h-4 w-32 animate-pulse rounded bg-skeleton" />
          <div className="mt-4 flex flex-col gap-2">
            <ItemRowSkeleton />
            <ItemRowSkeleton />
          </div>
        </section>
      ))}
    </div>
  );
}

interface DrawerState {
  categoryId: number;
  item: MenuItem | null;
}

export default function Menu() {
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  function load() {
    setLoading(true);
    setLoadError(false);
    return fetchMenu()
      .then((data) => setMenu(data.menu))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (name.length === 0) return;
    setActionError(null);
    try {
      await createCategory({ name, position: menu?.length ?? 0, active: true });
      setNewCategoryName('');
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleRenameCategory(category: MenuCategory, name: string) {
    if (name.trim() === category.name || name.trim().length === 0) return;
    try {
      await updateCategory(category.id, {
        name: name.trim(),
        position: category.position,
        active: category.active,
      });
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleToggleCategoryActive(category: MenuCategory) {
    try {
      await updateCategory(category.id, {
        name: category.name,
        position: category.position,
        active: !category.active,
      });
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleDeleteCategory(category: MenuCategory) {
    if (!window.confirm(t('menu.category.confirmDelete'))) return;
    try {
      await deleteCategory(category.id);
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleMoveCategory(index: number, direction: -1 | 1) {
    if (!menu) return;
    const ids = reorderedIds(menu, index, direction);
    if (!ids) return;
    try {
      await reorderCategories(ids);
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleMoveItem(
    category: MenuCategory,
    index: number,
    direction: -1 | 1,
  ) {
    const ids = reorderedIds(category.items, index, direction);
    if (!ids) return;
    try {
      await reorderItems(ids);
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleToggleAvailability(item: MenuItem, available: boolean) {
    setMenu((current) =>
      current
        ? current.map((cat) => ({
            ...cat,
            items: cat.items.map((i) =>
              i.id === item.id ? { ...i, available } : i,
            ),
          }))
        : current,
    );
    try {
      await setItemAvailability(item.id, available);
    } catch {
      setActionError(t('menu.errors.generic'));
      await load();
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    if (!window.confirm(t('menu.item.confirmDelete'))) return;
    try {
      await deleteItem(item.id);
      await load();
    } catch {
      setActionError(t('menu.errors.generic'));
    }
  }

  async function handleSaveItem(input: MenuItemFormInput) {
    if (drawer?.item) {
      await updateItem(drawer.item.id, input);
    } else {
      await createItem(input);
    }
    setDrawer(null);
    await load();
  }

  const itemLabels = {
    fromPrice: t('menu.item.from'),
    noPrice: t('menu.item.noPrice'),
    available: t('menu.item.available'),
    unavailable: t('menu.item.unavailable'),
    edit: t('menu.item.edit'),
    delete: t('menu.item.delete'),
    moveUp: t('menu.item.moveUp'),
    moveDown: t('menu.item.moveDown'),
    inactive: t('menu.item.inactiveBadge'),
  };

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-8 py-10">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
            <UtensilsCrossed className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <h1 className="text-xl font-medium text-fg">{t('menu.title')}</h1>
            <p className="text-sm text-fg-muted">{t('menu.subtitle')}</p>
          </div>
        </header>

        {loadError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('menu.loadError')}
          </p>
        )}

        {actionError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {actionError}
          </p>
        )}

        {loading || !menu ? (
          <MenuSkeleton />
        ) : (
          <div className="flex flex-col gap-6">
            {menu.map((category, categoryIndex) => (
              <section
                key={category.id}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <header className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="flex flex-none flex-col">
                    <button
                      type="button"
                      onClick={() => void handleMoveCategory(categoryIndex, -1)}
                      disabled={categoryIndex === 0}
                      aria-label={t('menu.category.moveUp')}
                      className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMoveCategory(categoryIndex, 1)}
                      disabled={categoryIndex === menu.length - 1}
                      aria-label={t('menu.category.moveDown')}
                      className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>

                  <input
                    type="text"
                    defaultValue={category.name}
                    aria-label={t('menu.category.name')}
                    onBlur={(e) => void handleRenameCategory(category, e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-fg outline-none transition hover:border-line focus:border-accent focus:bg-canvas"
                  />

                  <span className="flex-none text-[13px] text-fg-subtle">
                    {category.items.length}{' '}
                    {category.items.length === 1
                      ? t('menu.category.itemLabel')
                      : t('menu.category.itemsLabel')}
                  </span>

                  <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                    <input
                      type="checkbox"
                      checked={category.active}
                      onChange={() => void handleToggleCategoryActive(category)}
                    />
                    {t('menu.category.active')}
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleDeleteCategory(category)}
                    aria-label={t('menu.category.delete')}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </header>

                <div className="flex flex-col gap-2">
                  {category.items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[13px] text-fg-subtle">
                      {t('menu.category.emptyCategory')}
                    </p>
                  )}
                  {category.items.map((item, itemIndex) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      labels={itemLabels}
                      onEdit={() => setDrawer({ categoryId: category.id, item })}
                      onDelete={() => void handleDeleteItem(item)}
                      onToggleAvailability={(available) =>
                        void handleToggleAvailability(item, available)
                      }
                      onMoveUp={
                        itemIndex > 0
                          ? () => void handleMoveItem(category, itemIndex, -1)
                          : undefined
                      }
                      onMoveDown={
                        itemIndex < category.items.length - 1
                          ? () => void handleMoveItem(category, itemIndex, 1)
                          : undefined
                      }
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setDrawer({ categoryId: category.id, item: null })}
                  className="mt-4 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent transition hover:bg-hover"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('menu.item.add')}
                </button>
              </section>
            ))}

            <section className="rounded-2xl border border-dashed border-line p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('menu.category.newPlaceholder')}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => void handleAddCategory()}
                  disabled={newCategoryName.trim().length === 0}
                  className="flex-none rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
                >
                  {t('menu.category.add')}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      {drawer && menu && (
        <ItemDrawer
          open
          categories={menu}
          item={drawer.item}
          defaultCategoryId={drawer.categoryId}
          onClose={() => setDrawer(null)}
          onSave={handleSaveItem}
        />
      )}
    </div>
  );
}
