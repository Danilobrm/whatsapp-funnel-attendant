import { getDashboard } from "../services/dashboard.service.js";
import { tenantOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

export const getDashboardHandler = asyncHandler(async (req, res) => {
  const dashboard = await getDashboard(tenantOf(req));
  res.json({ dashboard });
});
