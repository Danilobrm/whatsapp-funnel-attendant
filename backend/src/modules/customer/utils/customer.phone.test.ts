import { describe, expect, it } from "vitest";

import { customerPhoneFor } from "./customer.phone.js";

describe("customerPhoneFor", () => {
  it("uses the wa_id as the phone on WhatsApp", () => {
    expect(customerPhoneFor("whatsapp", "5561990000001")).toBe("5561990000001");
  });

  it("strips the sim- prefix for simulated customers", () => {
    expect(customerPhoneFor("simulator", "sim-5561990000009")).toBe(
      "5561990000009",
    );
  });

  it("keeps the admin default contact as-is", () => {
    expect(customerPhoneFor("simulator", "admin-3")).toBe("admin-3");
  });

  // Um contato de WhatsApp que por acaso comece com "sim-" não é simulado.
  it("only treats sim- as a prefix on the simulator channel", () => {
    expect(customerPhoneFor("whatsapp", "sim-1")).toBe("sim-1");
  });
});
