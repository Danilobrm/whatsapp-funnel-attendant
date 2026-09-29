import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { saveProductImage } from "../../modules/menu/imageStorage.js";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  getFullMenu,
  reorderCategories,
  reorderItems,
  setItemAvailability,
  updateCategory,
  updateItem,
} from "../../modules/menu/menu.service.js";
import { tenantOf } from "../utils/authContext.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import type { Request } from "express";

/** Rotas com `:id` numérico — um id não numérico é sempre "não encontrado". */
function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new InvalidMenuError("item_not_found", "id");
  }
  return id;
}

function orderedIds(body: unknown): number[] {
  const raw = (body as { orderedIds?: unknown } | null)?.orderedIds;
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === "number")) {
    throw new InvalidMenuError("item_not_found", "orderedIds");
  }
  return raw;
}

export const getMenu = asyncHandler(async (req, res) => {
  const menu = await getFullMenu(tenantOf(req));
  res.json({ menu });
});

export const postCategory = asyncHandler(async (req, res) => {
  const category = await createCategory(tenantOf(req), req.body);
  res.status(201).json({ category });
});

export const putCategory = asyncHandler(async (req, res) => {
  const category = await updateCategory(tenantOf(req), idParam(req), req.body);
  res.json({ category });
});

export const deleteCategoryHandler = asyncHandler(async (req, res) => {
  await deleteCategory(tenantOf(req), idParam(req));
  res.status(204).send();
});

export const postCategoriesReorder = asyncHandler(async (req, res) => {
  await reorderCategories(tenantOf(req), orderedIds(req.body));
  res.status(204).send();
});

export const postItem = asyncHandler(async (req, res) => {
  const item = await createItem(tenantOf(req), req.body);
  res.status(201).json({ item });
});

export const putItem = asyncHandler(async (req, res) => {
  const item = await updateItem(tenantOf(req), idParam(req), req.body);
  res.json({ item });
});

export const deleteItemHandler = asyncHandler(async (req, res) => {
  await deleteItem(tenantOf(req), idParam(req));
  res.status(204).send();
});

export const patchItemAvailability = asyncHandler(async (req, res) => {
  const available = req.body?.available === true;
  await setItemAvailability(tenantOf(req), idParam(req), available);
  res.status(204).send();
});

export const postItemsReorder = asyncHandler(async (req, res) => {
  await reorderItems(tenantOf(req), orderedIds(req.body));
  res.status(204).send();
});

/**
 * `uploadProductImage` (multer) roda ANTES desta, na rota. Já valida tipo
 * (fileFilter) e tamanho (limits) — aqui só falta checar que veio arquivo.
 */
export const postItemImage = asyncHandler(async (req, res) => {
  // `tenantOf` só pra manter o guard de autenticação explícito aqui também —
  // upload não é tenant-scoped em si (o arquivo não carrega tenant_id), mas
  // a rota exige o mesmo login que o resto de /api/menu.
  tenantOf(req);

  if (!req.file) {
    throw new InvalidMenuError("image_required", "image");
  }

  const stored = await saveProductImage(req.file.buffer, req.file.mimetype);
  res.status(201).json(stored);
});
