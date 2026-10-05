import { Injectable } from "@nestjs/common";
import multer from "multer";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { ALLOWED_IMAGE_MIME_TYPES } from "../storage/imageStorage.js";

import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";

/** 5MB — generoso pra foto de celular, curto o bastante pra não travar o upload. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Upload de imagem de produto — memória, não disco: quem grava é
 * `imageStorage.ts` (e mais tarde o cliente do S3), não o multer. Recusa
 * cedo (antes de gravar 1 byte) quando o tipo não é imagem — `fileFilter`
 * roda por arquivo, antes do corpo terminar de chegar.
 */
const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      callback(new InvalidMenuError("image_invalid_type", "image"));
      return;
    }
    callback(null, true);
  },
}).single("image");

/**
 * Roda o multer e deixa o erro ORIGINAL subir. Não usamos o `FileInterceptor`
 * do Nest porque ele reescreve `LIMIT_FILE_SIZE` em 413: o contrato é 422
 * `image_too_large`, que o `mapError` já produz a partir do `MulterError`.
 *
 * O guard global roda antes de qualquer interceptor: sem login, nem lê o corpo.
 */
@Injectable()
export class ProductImageUploadInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();

    await new Promise<void>((resolve, reject) => {
      uploadProductImage(
        http.getRequest<Request>(),
        http.getResponse<Response>(),
        (error: unknown) => (error ? reject(error) : resolve()),
      );
    });

    return next.handle();
  }
}
