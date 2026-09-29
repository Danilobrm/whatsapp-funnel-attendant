import { request } from '../client';

export type PricingRule = 'sum' | 'max' | 'average';

export interface MenuOption {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
  position: number;
}

export interface OptionGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  pricingRule: PricingRule;
  position: number;
  options: MenuOption[];
}

export interface ItemSize {
  id: number;
  name: string;
  priceCents: number;
  position: number;
}

export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  position: number;
  sizes: ItemSize[];
  optionGroups: OptionGroup[];
}

export interface MenuCategory {
  id: number;
  name: string;
  position: number;
  active: boolean;
  items: MenuItem[];
}

export type Menu = MenuCategory[];

export interface MenuCategoryFormInput {
  name: string;
  position: number;
  active: boolean;
}

export interface MenuItemFormInput {
  categoryId: number;
  name: string;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  position: number;
  sizes: Array<{ name: string; priceCents: number; position: number }>;
  optionGroups: Array<{
    name: string;
    minSelect: number;
    maxSelect: number;
    pricingRule: PricingRule;
    position: number;
    options: Array<{
      name: string;
      priceCents: number;
      available: boolean;
      position: number;
    }>;
  }>;
}

/** 422 do backend — `code` decide a mensagem, nunca o `message` cru. */
export class MenuRejectedError extends Error {
  readonly code: string;
  readonly field: string;

  constructor(code: string, field: string) {
    super(code);
    this.name = 'MenuRejectedError';
    this.code = code;
    this.field = field;
  }
}

const onStatus = {
  422: (payload: unknown) => {
    const data = payload as { code?: string; field?: string } | null;
    return new MenuRejectedError(data?.code ?? 'unknown', data?.field ?? '');
  },
};

export function fetchMenu(): Promise<{ menu: Menu }> {
  return request('/api/menu');
}

export function createCategory(
  input: MenuCategoryFormInput,
): Promise<{ category: MenuCategory }> {
  return request('/api/menu/categories', { method: 'POST', body: input, onStatus });
}

export function updateCategory(
  id: number,
  input: MenuCategoryFormInput,
): Promise<{ category: MenuCategory }> {
  return request(`/api/menu/categories/${id}`, {
    method: 'PUT',
    body: input,
    onStatus,
  });
}

export function deleteCategory(id: number): Promise<void> {
  return request(`/api/menu/categories/${id}`, { method: 'DELETE', onStatus });
}

export function reorderCategories(orderedIds: number[]): Promise<void> {
  return request('/api/menu/categories/reorder', {
    method: 'POST',
    body: { orderedIds },
  });
}

export function createItem(
  input: MenuItemFormInput,
): Promise<{ item: MenuItem }> {
  return request('/api/menu/items', { method: 'POST', body: input, onStatus });
}

export function updateItem(
  id: number,
  input: MenuItemFormInput,
): Promise<{ item: MenuItem }> {
  return request(`/api/menu/items/${id}`, { method: 'PUT', body: input, onStatus });
}

export function deleteItem(id: number): Promise<void> {
  return request(`/api/menu/items/${id}`, { method: 'DELETE', onStatus });
}

export function setItemAvailability(
  id: number,
  available: boolean,
): Promise<void> {
  return request(`/api/menu/items/${id}/availability`, {
    method: 'PATCH',
    body: { available },
  });
}

export function reorderItems(orderedIds: number[]): Promise<void> {
  return request('/api/menu/items/reorder', {
    method: 'POST',
    body: { orderedIds },
  });
}

/** Envia a foto do produto (multipart) e devolve a URL pública — sem link, só upload. */
export function uploadItemImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('image', file);
  return request('/api/menu/images', { method: 'POST', body: form, onStatus });
}
