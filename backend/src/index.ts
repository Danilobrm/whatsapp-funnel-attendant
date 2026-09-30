import "dotenv/config";
import { assertProductionSecrets, env } from "./config/env.js";
import { createApp } from "./bootstrap.js";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] escapou do tratamento de erro:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// Antes de qualquer I/O: subir produção com o segredo de dev é falha de
// configuração, e ela precisa aparecer no boot, não no primeiro login.
try {
  assertProductionSecrets();
} catch (err) {
  console.error("Configuração inválida:", err);
  process.exit(1);
}

// `init()` roda o `onModuleInit` do `MigrationsService`: se o schema não aplica,
// o boot cai aqui, antes de abrir a porta.
try {
  const app = await createApp();
  await app.init();
  await app.listen(env.port);
  console.log(`API rodando em http://localhost:${env.port}`);
} catch (err) {
  console.error("Falha ao subir a API:", err);
  process.exit(1);
}
