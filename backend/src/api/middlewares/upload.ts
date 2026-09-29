import multer from "multer";

import { InvalidMenuError } from "../../modules/errors/invalidMenu.error.js";
import { ALLOWED_IMAGE_MIME_TYPES } from "../../modules/menu/imageStorage.js";

/** 5MB — generoso pra foto de celular, curto o bastante pra não travar o upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Upload de imagem de produto — memória, não disco: quem grava é
 * `imageStorage.ts` (e mais tarde o cliente do S3), não o multer. Recusa
 * cedo (antes de gravar 1 byte) quando o tipo não é imagem — `fileFilter`
 * roda por arquivo, antes do corpo terminar de chegar.
 */
export const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      callback(new InvalidMenuError("image_invalid_type", "image"));
      return;
    }
    callback(null, true);
  },
});
