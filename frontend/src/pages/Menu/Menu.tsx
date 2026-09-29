import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';

import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  fetchMenu,
  reorderCategories,
  reorderItems,
  updateCategory,
  updateItem,
  type Menu as MenuData,
  type MenuCategory,
  type MenuItem,
  type MenuItemFormInput,
} from '../../api/menu/menu.ts';
import CategoryChips, {
  CategoryChipsSkeleton,
  type CategorySelection,
} from '../../components/menu/CategoryChips/CategoryChips.tsx';
import ItemCard, { ItemCardSkeleton } from '../../components/menu/ItemCard/ItemCard.tsx';
import ItemDrawer from '../../components/menu/ItemDrawer/ItemDrawer.tsx';
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

const ICON_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-hover hover:text-fg disabled:opacity-30';

const GRID =
  'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5';

function ItemGridSkeleton() {
  return (
    <div aria-busy="true" data-testid="menu-skeleton" className={GRID}>
      {[0, 1, 2, 3].map((i) => (
        <ItemCardSkeleton key={i} />
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
  const [selected, setSelected] = useState<CategorySelection>('all');

  function load() {
    setLoading(true);
    setLoadError(false);
    return fetchMenu()
      .then((data) => {
        setMenu(data.menu);
        // A categoria selecionada pode ter sido excluída — volta pro "Todos".
        setSelected((current) =>
          current === 'all' || data.menu.some((c) => c.id === current)
            ? current
            : 'all',
        );
      })
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
      const { category } = await createCategory({
        name,
        position: menu?.length ?? 0,
        active: true,
      });
      setNewCategoryName('');
      await load();
      setSelected(category.id);
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

  async function handleDeleteItem(item: MenuItem) {
    try {
      await deleteItem(item.id);
      setDrawer(null);
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
    noPrice: t('menu.item.noPrice'),
    moveLeft: t('menu.item.moveLeft'),
    moveRight: t('menu.item.moveRight'),
  };

  const selectedIndex =
    selected === 'all' || !menu ? -1 : menu.findIndex((c) => c.id === selected);
  const selectedCategory = menu?.[selectedIndex] ?? null;
  const visibleItems = !menu
    ? []
    : selectedCategory
      ? selectedCategory.items.map((item) => ({
          item,
          category: selectedCategory,
        }))
      : menu.flatMap((category) =>
          category.items.map((item) => ({ item, category })),
        );

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-4 pb-28 pt-6 md:px-8 md:pb-28 md:pt-10">
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
          <CategoryChipsSkeleton />
        ) : (
          <CategoryChips
            categories={menu.map((c) => ({
              id: c.id,
              name: c.name,
              count: c.items.length,
              active: c.active,
            }))}
            totalCount={menu.reduce((sum, c) => sum + c.items.length, 0)}
            selected={selected}
            onSelect={setSelected}
            newName={newCategoryName}
            onNewNameChange={setNewCategoryName}
            onAdd={() => void handleAddCategory()}
            labels={{
              all: t('menu.category.all'),
              item: t('menu.category.itemLabel'),
              items: t('menu.category.itemsLabel'),
              newPlaceholder: t('menu.category.newPlaceholder'),
              add: t('menu.category.add'),
              addLabel: t('menu.category.addLabel'),
            }}
          />
        )}

        <hr className="border-t border-dashed border-line" />

        {loading || !menu ? (
          <ItemGridSkeleton />
        ) : (
          <>
            {selectedCategory && selectedIndex !== -1 && (
              <div className="flex flex-wrap items-center gap-3">
                <>
                  <div className="flex flex-none gap-1">
                    <button
                      type="button"
                      onClick={() => void handleMoveCategory(selectedIndex, -1)}
                      disabled={selectedIndex === 0}
                      aria-label={t('menu.category.moveLeft')}
                      className={ICON_BUTTON}
                    >
                      <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMoveCategory(selectedIndex, 1)}
                      disabled={selectedIndex === menu.length - 1}
                      aria-label={t('menu.category.moveRight')}
                      className={ICON_BUTTON}
                    >
                      <ChevronRight className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>

                  <input
                    key={selectedCategory.id}
                    type="text"
                    defaultValue={selectedCategory.name}
                    aria-label={t('menu.category.name')}
                    onBlur={(e) =>
                      void handleRenameCategory(
                        selectedCategory,
                        e.target.value,
                      )
                    }
                    className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-fg outline-none transition hover:border-line focus:border-accent focus:bg-canvas"
                  />

                  <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                    <input
                      type="checkbox"
                      checked={selectedCategory.active}
                      onChange={() =>
                        void handleToggleCategoryActive(selectedCategory)
                      }
                    />
                    {t('menu.category.active')}
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleDeleteCategory(selectedCategory)}
                    aria-label={t('menu.category.delete')}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              </div>
            )}

            {menu.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-subtle">
                {t('menu.empty')}
              </p>
            ) : (
              <>
                {visibleItems.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-subtle">
                    {t('menu.category.emptyCategory')}
                  </p>
                )}
                <div className={GRID}>
                  {visibleItems.map(({ item, category }, itemIndex) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      labels={itemLabels}
                      onEdit={() =>
                        setDrawer({ categoryId: category.id, item })
                      }
                      // Reordenar só faz sentido dentro de uma categoria — no
                      // "Todos" os itens de categorias diferentes se misturam.
                      onMoveLeft={
                        selectedCategory && itemIndex > 0
                          ? () => void handleMoveItem(category, itemIndex, -1)
                          : undefined
                      }
                      onMoveRight={
                        selectedCategory && itemIndex < visibleItems.length - 1
                          ? () => void handleMoveItem(category, itemIndex, 1)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <div className="fixed bottom-5 right-4 z-30 flex flex-col items-end gap-3 md:bottom-8 md:right-8">
        {menu && menu.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const categoryId = selectedCategory?.id ?? menu[0]?.id;
              if (categoryId !== undefined) {
                setDrawer({ categoryId, item: null });
              }
            }}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-medium text-accent-fg shadow-lg transition hover:opacity-90 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {t('menu.item.add')}
          </button>
        )}
      </div>

      {drawer && menu && (
        <ItemDrawer
          open
          categories={menu}
          item={drawer.item}
          defaultCategoryId={drawer.categoryId}
          onClose={() => setDrawer(null)}
          onSave={handleSaveItem}
          onDelete={
            drawer.item ? () => handleDeleteItem(drawer.item!) : undefined
          }
        />
      )}
    </div>
  );
}
