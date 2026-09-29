import {
  buildPersonaTexts,
  getBotSettings,
  settingsOptions,
  updateBotSettings,
} from "../services/settings.service.js";
import { tenantOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getBotSettings(tenantOf(req));
  res.json({
    settings,
    options: settingsOptions(),
    preview: buildPersonaTexts(settings),
  });
});

export const putSettings = asyncHandler(async (req, res) => {
  const settings = await updateBotSettings(tenantOf(req), req.body);
  res.json({ settings, preview: buildPersonaTexts(settings) });
});
