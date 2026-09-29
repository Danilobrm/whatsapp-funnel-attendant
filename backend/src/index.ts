import "dotenv/config";
import { assertProductionSecrets, env } from "./config/env.js";
import { runMigrations } from "./config/migrate.js";
import { createApp } from "./bootstrap.js";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] escapou do asyncHandler:", reason);
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

try {
  await runMigrations();
} catch (err) {
  console.error("Falha ao aplicar schema:", err);
  process.exit(1);
}

const app = await createApp();

await app.listen(env.port);
console.log(`API rodando em http://localhost:${env.port}`);
