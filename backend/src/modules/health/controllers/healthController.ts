import { getHealthReport } from "../services/health.service.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

export const health = asyncHandler(async (_req, res) => {
  const report = await getHealthReport();

  res.status(report.status === "ok" ? 200 : 500).json(report);
});
