# Attendant

Atendente de pedidos por WhatsApp para restaurantes independentes. O cliente conversa no WhatsApp; o dono do restaurante configura a persona e testa o atendente num painel web.

Base extraída do `faq-chatbot-analytics`: multi-tenant, auth JWT, tratamento de erros tipado, i18n, design system e persona do bot. A parte de FAQ, curadoria e dashboard ficou de fora.

## Rodando local

```bash
docker compose up -d postgres ollama
docker exec -it attendant_ollama ollama pull llama3.2

cd backend
cp .env.example .env
npm install
npm run seed      # Pizzaria Demo · danilo@admin.com / 123456 · bot Nina
npm run dev       # http://localhost:3000/health

cd ../frontend
npm install
npm run dev       # http://localhost:5173 → Simulador
```

No simulador, "oi" responde com o texto fixo da persona; um pedido vai para a IA (Ollama). Sem Ollama rodando, a IA cai no fallback da persona e a conversa continua. `/reiniciar` apaga a conversa de teste.

## Ligando o WhatsApp (número de teste da Meta)

1. Em developers.facebook.com crie um app do tipo Business e adicione o produto WhatsApp.
2. Em **API Setup** copie o token temporário e o **Phone number ID**; em **Configurações → Básico** copie o **App Secret**.
3. No `backend/.env`: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` e um `WHATSAPP_VERIFY_TOKEN` inventado por você.
4. Ligue o tenant ao número: `SEED_WHATSAPP_PHONE_NUMBER_ID=<phone number id> npm run seed`.
5. Exponha a API (`ngrok http 3000`) e registre o webhook em **WhatsApp → Configuration**: URL `https://<ngrok>/webhooks/whatsapp`, verify token igual ao do `.env`, e assine o campo `messages`.
6. Adicione seu celular como destinatário de teste e mande "oi" para o número de teste.

## Testes

```bash
cd backend && npm test && npm run lint && npm run typecheck
cd frontend && npm test && npm run lint && npm run typecheck
```

Arquitetura, convenções e próximos passos estão no [CLAUDE.md](CLAUDE.md).
