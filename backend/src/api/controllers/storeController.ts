import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import {
  createZone,
  getStoreSettings,
  listZones,
  removeZone,
  updateStoreSettings,
  updateZone,
} from "../../modules/store/store.service.js";
import { tenantOf } from "../utils/authContext.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import type { Request } from "express";

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    throw new InvalidMenuError("zone_not_found", "id");
  }
  return id;
}

export const getStore = asyncHandler(async (req, res) => {
  const settings = await getStoreSettings(tenantOf(req));
  res.json({ settings });
});

export const putStore = asyncHandler(async (req, res) => {
  const settings = await updateStoreSettings(tenantOf(req), req.body);
  res.json({ settings });
});

export const getZones = asyncHandler(async (req, res) => {
  const zones = await listZones(tenantOf(req));
  res.json({ zones });
});

export const postZone = asyncHandler(async (req, res) => {
  const zone = await createZone(tenantOf(req), req.body);
  res.status(201).json({ zone });
});

export const putZone = asyncHandler(async (req, res) => {
  const zone = await updateZone(tenantOf(req), idParam(req), req.body);
  res.json({ zone });
});

export const deleteZone = asyncHandler(async (req, res) => {
  await removeZone(tenantOf(req), idParam(req));
  res.status(204).send();
});
