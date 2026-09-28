import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import { parseBRLInput } from '../../../lib/money.ts';
import { useT } from '../../../i18n/index.tsx';

import type {
  MenuCategory,
  MenuItem,
  MenuItemFormInput,
  PricingRule,
} from '../../../api/menu';

interface SizeDraft {
  name: string;
  priceText: string;
}

interface OptionDraft {
  name: string;
  priceText: string;
}

interface GroupDraft {
  name: string;
  minSelect: string;
  maxSelect: string;
  pricingRule: PricingRule;
  options: OptionDraft[];
}

interface ItemDrawerProps {
  open: boolean;
  categories: MenuCategory[];
  item: MenuItem | null;
  defaultCategoryId: number | null;
  onClose: () => void;
  onSave: (input: MenuItemFormInput) => Promise<void>;
}

function centsToText(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function toSizeDraft(item: MenuItem | null): SizeDraft[] {
  return (item?.sizes ?? []).map((s) => ({
    name: s.name,
    priceText: centsToText(s.priceCents),
  }));
}

function toGroupDraft(item: MenuItem | null): GroupDraft[] {
  return (item?.optionGroups ?? []).map((g) => ({
    name: g.name,
    minSelect: String(g.minSelect),
    maxSelect: String(g.maxSelect),
    pricingRule: g.pricingRule,
    options: g.options.map((o) => ({
      name: o.name,
      priceText: centsToText(o.priceCents),
    })),
  }));
}

export default function ItemDrawer({
  open,
  categories,
  item,
  defaultCategoryId,
  onClose,
  onSave,
}: ItemDrawerProps) {
  const t = useT();

  const [categoryId, setCategoryId] = useState(
    item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? 0,
  );
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [pricingMode, setPricingMode] = useState<'single' | 'sizes'>(
    item && item.sizes.length > 0 ? 'sizes' : 'single',
  );
  const [priceText, setPriceText] = useState(
    item?.priceCents != null ? centsToText(item.priceCents) : '',
  );
  const [sizes, setSizes] = useState<SizeDraft[]>(() => toSizeDraft(item));
  const [groups, setGroups] = useState<GroupDraft[]>(() => toGroupDraft(item));
  const [available, setAvailable] = useState(item?.available ?? true);
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function addSize() {
    setSizes((current) => [...current, { name: '', priceText: '' }]);
  }
  function removeSize(index: number) {
    setSizes((current) => current.filter((_, i) => i !== index));
  }
  function patchSize(index: number, patch: Partial<SizeDraft>) {
    setSizes((current) =>
      current.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addGroup() {
    setGroups((current) => [
      ...current,
      { name: '', minSelect: '0', maxSelect: '1', pricingRule: 'sum', options: [] },
    ]);
  }
  function removeGroup(index: number) {
    setGroups((current) => current.filter((_, i) => i !== index));
  }
  function patchGroup(index: number, patch: Partial<GroupDraft>) {
    setGroups((current) =>
      current.map((g, i) => (i === index ? { ...g, ...patch } : g)),
    );
  }
  function addOption(groupIndex: number) {
    setGroups((current) =>
      current.map((g, i) =>
        i === groupIndex
          ? { ...g, options: [...g.options, { name: '', priceText: '' }] }
          : g,
      ),
    );
  }
  function removeOption(groupIndex: number, optionIndex: number) {
    setGroups((current) =>
      current.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.filter((_, j) => j !== optionIndex) }
          : g,
      ),
    );
  }
  function patchOption(
    groupIndex: number,
    optionIndex: number,
    patch: Partial<OptionDraft>,
  ) {
    setGroups((current) =>
      current.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              options: g.options.map((o, j) =>
                j === optionIndex ? { ...o, ...patch } : o,
              ),
            }
          : g,
      ),
    );
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const input: MenuItemFormInput = {
        categoryId,
        name: name.trim(),
        description: description.trim() || null,
        imageUrl: item?.imageUrl ?? null,
        priceCents: pricingMode === 'single' ? parseBRLInput(priceText) : null,
        available,
        active,
        position: item?.position ?? 0,
        sizes:
          pricingMode === 'sizes'
            ? sizes.map((s, i) => ({
                name: s.name.trim(),
                priceCents: parseBRLInput(s.priceText) ?? 0,
                position: i,
              }))
            : [],
        optionGroups: groups.map((g, i) => ({
          name: g.name.trim(),
          minSelect: Number(g.minSelect) || 0,
          maxSelect: Number(g.maxSelect) || 1,
          pricingRule: g.pricingRule,
          position: i,
          options: g.options.map((o, j) => ({
            name: o.name.trim(),
            priceCents: parseBRLInput(o.priceText) ?? 0,
            available: true,
            position: j,
          })),
        })),
      };
      await onSave(input);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'generic';
      const key = `menu.errors.${code}`;
      setError(t(key) === key ? t('menu.errors.generic') : t(key));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item ? t('menu.item.editTitle') : t('menu.item.newTitle')}
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <h2 className="text-base font-semibold text-fg">
            {item ? t('menu.item.editTitle') : t('menu.item.newTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('menu.item.close')}
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-5">
            {error && (
              <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}

            <div>
              <label
                htmlFor="item-category"
                className="block text-sm font-medium text-fg"
              >
                {t('menu.item.category')}
              </label>
              <select
                id="item-category"
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="item-name" className="block text-sm font-medium text-fg">
                {t('menu.item.name')}
              </label>
              <input
                id="item-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
            </div>

            <div>
              <label
                htmlFor="item-description"
                className="block text-sm font-medium text-fg"
              >
                {t('menu.item.description')}
              </label>
              <textarea
                id="item-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-fg">
                {t('menu.item.pricing')}
              </legend>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPricingMode('single')}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
                    pricingMode === 'single'
                      ? 'border-accent bg-hover text-fg'
                      : 'border-line text-fg-muted hover:bg-hover'
                  }`}
                >
                  {t('menu.item.pricingSingle')}
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode('sizes')}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
                    pricingMode === 'sizes'
                      ? 'border-accent bg-hover text-fg'
                      : 'border-line text-fg-muted hover:bg-hover'
                  }`}
                >
                  {t('menu.item.pricingSizes')}
                </button>
              </div>

              {pricingMode === 'single' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={t('menu.item.price')}
                  placeholder="0,00"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                />
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {sizes.map((size, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label={t('menu.item.sizeName')}
                        placeholder={t('menu.item.sizeName')}
                        value={size.name}
                        onChange={(e) =>
                          patchSize(index, { name: e.target.value })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={t('menu.item.price')}
                        placeholder="0,00"
                        value={size.priceText}
                        onChange={(e) =>
                          patchSize(index, { priceText: e.target.value })
                        }
                        className="w-24 flex-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => removeSize(index)}
                        aria-label={t('menu.item.removeSize')}
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addSize}
                    className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent transition hover:bg-hover"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    {t('menu.item.addSize')}
                  </button>
                </div>
              )}
            </fieldset>

            <div>
              <p className="text-sm font-medium text-fg">
                {t('menu.item.optionGroups')}
              </p>
              <div className="mt-3 flex flex-col gap-4">
                {groups.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="rounded-xl border border-line p-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label={t('menu.item.groupName')}
                        placeholder={t('menu.item.groupName')}
                        value={group.name}
                        onChange={(e) =>
                          patchGroup(groupIndex, { name: e.target.value })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => removeGroup(groupIndex)}
                        aria-label={t('menu.item.removeGroup')}
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <label className="flex-1 text-[13px] text-fg-muted">
                        {t('menu.item.minSelect')}
                        <input
                          type="number"
                          min={0}
                          value={group.minSelect}
                          onChange={(e) =>
                            patchGroup(groupIndex, { minSelect: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex-1 text-[13px] text-fg-muted">
                        {t('menu.item.maxSelect')}
                        <input
                          type="number"
                          min={1}
                          value={group.maxSelect}
                          onChange={(e) =>
                            patchGroup(groupIndex, { maxSelect: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex-1 text-[13px] text-fg-muted">
                        {t('menu.item.pricingRule')}
                        <select
                          value={group.pricingRule}
                          onChange={(e) =>
                            patchGroup(groupIndex, {
                              pricingRule: e.target.value as PricingRule,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                        >
                          <option value="sum">{t('menu.item.pricingRuleSum')}</option>
                          <option value="max">{t('menu.item.pricingRuleMax')}</option>
                          <option value="average">
                            {t('menu.item.pricingRuleAverage')}
                          </option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      {group.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            aria-label={t('menu.item.optionName')}
                            placeholder={t('menu.item.optionName')}
                            value={option.name}
                            onChange={(e) =>
                              patchOption(groupIndex, optionIndex, {
                                name: e.target.value,
                              })
                            }
                            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={t('menu.item.price')}
                            placeholder="0,00"
                            value={option.priceText}
                            onChange={(e) =>
                              patchOption(groupIndex, optionIndex, {
                                priceText: e.target.value,
                              })
                            }
                            className="w-24 flex-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(groupIndex, optionIndex)}
                            aria-label={t('menu.item.removeOption')}
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(groupIndex)}
                        className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent transition hover:bg-hover"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        {t('menu.item.addOption')}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addGroup}
                  className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent transition hover:bg-hover"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  {t('menu.item.addGroup')}
                </button>
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                />
                {t('menu.item.available')}
              </label>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                {t('menu.item.activeInMenu')}
              </label>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted transition hover:bg-hover hover:text-fg"
          >
            {t('menu.item.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || name.trim().length === 0}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? t('menu.item.saving') : t('menu.item.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}
