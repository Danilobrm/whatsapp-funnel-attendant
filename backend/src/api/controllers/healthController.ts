import { getHealthReport } from "../../modules/health/health.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const health = asyncHandler(async (_req, res) => {
  const report = await getHealthReport();

  res.status(report.status === "ok" ? 200 : 500).json(report);
});
