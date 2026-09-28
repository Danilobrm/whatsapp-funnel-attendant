import { describe, expect, it } from "vitest";

import {
  classifyIntent,
  classifyMessage,
  shouldBlockMessage,
} from "./guardrails.js";

describe("shouldBlockMessage", () => {
  it("blocks non-string input", () => {
    expect(shouldBlockMessage(undefined)).toBe(true);
    expect(shouldBlockMessage(null)).toBe(true);
    expect(shouldBlockMessage(42)).toBe(true);
  });

  it("blocks empty / whitespace strings", () => {
    expect(shouldBlockMessage("")).toBe(true);
    expect(shouldBlockMessage("   ")).toBe(true);
  });

  it("accepts meaningful strings", () => {
    expect(shouldBlockMessage("oi")).toBe(false);
    expect(shouldBlockMessage("como troco minha senha?")).toBe(false);
  });
});

describe("classifyIntent", () => {
  it("routes bare greetings to greeting", () => {
    for (const g of ["oi", "olá", "hi", "hello", "bom dia"]) {
      expect(classifyIntent(g).intent).toBe("greeting");
    }
  });

  it("routes real requests to business", () => {
    expect(classifyIntent("quero uma pizza de calabresa").intent).toBe(
      "business",
    );
  });

  it("does not misclassify a request that contains a greeting word", () => {
    const result = classifyIntent("oi, qual o horário de atendimento?");
    expect(result.intent).toBe("business");
  });

  // Regressão: `normalize` só tirava pontuação FINAL, então "bem?" sobrevivia
  // como token residual e a saudação virava pergunta de negócio — gastando
  // uma chamada de LLM para responder "oi".
  it("still detects the greeting when punctuation sits inside the message", () => {
    for (const g of [
      "Oi, tudo bem?",
      "Olá, bom dia!",
      "Bom dia, tudo bem?",
      "obrigado, valeu!",
      "E aí, beleza?",
    ]) {
      expect(classifyIntent(g).intent).toBe("greeting");
    }
  });
});

describe("classifyMessage", () => {
  it("labels greeting", () => {
    expect(classifyMessage("oi").kind).toBe("greeting");
  });

  it("labels a comma-separated greeting as greeting, not a business question", () => {
    expect(classifyMessage("Oi, tudo bem?").kind).toBe("greeting");
  });

  it("labels meaningful question", () => {
    expect(classifyMessage("como reset senha").kind).toBe("meaningful");
  });

  it("labels emoji-only as junk", () => {
    const r = classifyMessage("🙂");
    expect(r.kind).toBe("junk");
    expect(r.reason).toBe("emoji_only");
  });

  it("labels blocklisted junk", () => {
    const r = classifyMessage("kkkk");
    expect(r.kind).toBe("junk");
  });
});

describe("classifyMessage — identidade do bot", () => {
  it.each([
    "Qual é o seu nome?",
    "qual seu nome",
    "qual o teu nome?",
    "Como você se chama?",
    "como vc se chama",
    "Quem é você?",
    "quem eh vc",
    "Qual o nome do assistente?",
    "qual o nome da atendente?",
    "Você é um robô?",
    "voce e uma ia",
  ])("classifies %j as identity", (message) => {
    const r = classifyMessage(message);
    expect(r.kind).toBe("identity");
    expect(r.reason).toBe("identity");
  });

  it("still classifies identity after a greeting prefix", () => {
    expect(classifyMessage("oi, qual seu nome?").kind).toBe("identity");
  });

  it.each([
    "Qual o nome do sistema?",
    "Qual é o seu horário de atendimento?",
    "Como faço para trocar meu nome no cadastro?",
    "Quem é o responsável pelo financeiro?",
    "Vocês entregam no centro?",
    "Quero duas pizzas grandes",
  ])("does not swallow the business question %j", (message) => {
    expect(classifyMessage(message).kind).toBe("meaningful");
  });
});
