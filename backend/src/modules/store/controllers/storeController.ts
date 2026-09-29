import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import {
  geocodeAddress,
  getStoreGeo,
  searchCities,
  setStoreCity,
} from "../../geo/services/geo.service.js";
import {
  createZone,
  getStoreSettings,
  listZones,
  removeZone,
  updateStoreSettings,
  updateZone,
} from "../services/store.service.js";
import { tenantOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

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

export const getGeo = asyncHandler(async (req, res) => {
  const geo = await getStoreGeo(tenantOf(req));
  res.json({ geo });
});

export const putGeo = asyncHandler(async (req, res) => {
  const geo = await setStoreCity(tenantOf(req), req.body);
  res.json({ geo });
});

export const getCities = asyncHandler(async (req, res) => {
  const cities = await searchCities(req.query.q);
  res.json({ cities });
});

export const getGeocode = asyncHandler(async (req, res) => {
  const results = await geocodeAddress(req.query.q);
  res.json({ results });
});
