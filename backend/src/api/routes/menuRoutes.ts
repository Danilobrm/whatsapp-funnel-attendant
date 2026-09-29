import { Router } from "express";

import {
  deleteCategoryHandler,
  deleteItemHandler,
  getMenu,
  patchItemAvailability,
  postCategoriesReorder,
  postCategory,
  postItem,
  postItemImage,
  postItemsReorder,
  putCategory,
  putItem,
} from "../controllers/menuController.js";
import { uploadProductImage } from "../middlewares/upload.js";

// Guardado no mount, em `server.ts`.
export const menuRoutes = Router();

menuRoutes.get("/", getMenu);

menuRoutes.post("/categories", postCategory);
menuRoutes.put("/categories/:id", putCategory);
menuRoutes.delete("/categories/:id", deleteCategoryHandler);
menuRoutes.post("/categories/reorder", postCategoriesReorder);

menuRoutes.post("/items", postItem);
menuRoutes.put("/items/:id", putItem);
menuRoutes.delete("/items/:id", deleteItemHandler);
menuRoutes.patch("/items/:id/availability", patchItemAvailability);
menuRoutes.post("/items/reorder", postItemsReorder);

menuRoutes.post("/images", uploadProductImage.single("image"), postItemImage);
