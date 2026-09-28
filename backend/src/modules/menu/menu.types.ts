export type PricingRule = "sum" | "max" | "average";
export const PRICING_RULES: readonly PricingRule[] = ["sum", "max", "average"];

export interface MenuOption {
  id: number;
  name: string;
  priceCents: number;
  available: boolean;
  position: number;
}

export type MenuOptionInput = Omit<MenuOption, "id">;

export interface OptionGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  pricingRule: PricingRule;
  position: number;
  options: MenuOption[];
}

export type OptionGroupInput = Omit<OptionGroup, "id" | "options"> & {
  options: MenuOptionInput[];
};

export interface ItemSize {
  id: number;
  name: string;
  priceCents: number;
  position: number;
}

export type ItemSizeInput = Omit<ItemSize, "id">;

export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  /** Ignorado quando `sizes` não está vazio — o preço vem do tamanho escolhido. */
  priceCents: number | null;
  imageUrl: string | null;
  available: boolean;
  active: boolean;
  position: number;
  sizes: ItemSize[];
  optionGroups: OptionGroup[];
}

export type MenuItemInput = Omit<
  MenuItem,
  "id" | "sizes" | "optionGroups"
> & {
  sizes: ItemSizeInput[];
  optionGroups: OptionGroupInput[];
};

export interface MenuCategory {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

export type MenuCategoryInput = Omit<MenuCategory, "id">;

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}

/** O cardápio inteiro, na ordem de exibição — usado pelo painel E pelo agente. */
export type Menu = MenuCategoryWithItems[];
