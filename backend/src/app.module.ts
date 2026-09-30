import { Module } from "@nestjs/common";

import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./common/database/database.module.js";
import { AgentModule } from "./modules/agent/agent.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ConversationModule } from "./modules/conversation/conversation.module.js";
import { InboundModule } from "./modules/conversation/inbound.module.js";
import { CustomerModule } from "./modules/customer/customer.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { GeoModule } from "./modules/geo/geo.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MenuModule } from "./modules/menu/menu.module.js";
import { MenuLinkModule } from "./modules/menulink/menulink.module.js";
import { OrderModule } from "./modules/order/order.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { SimulatorModule } from "./modules/simulator/simulator.module.js";
import { StoreModule } from "./modules/store/store.module.js";
import { TenantsModule } from "./modules/tenants/tenants.module.js";
import { WhatsAppModule } from "./modules/whatsapp/whatsapp.module.js";

/**
 * Raiz do Nest: infraestrutura (`DatabaseModule` global, `CommonModule` com o
 * guard e o filter globais) e um módulo por contexto de negócio, cada um dono
 * dos seus controllers, services, repositories e clients.
 *
 * Grafo sem ciclos: `Conversation` (dados + envio ativo) e `Inbound` (a porta
 * de entrada de mensagens) são módulos separados justamente para `Order`,
 * `MenuLink` e `Agent` poderem enviar mensagem sem depender de quem os chama.
 */
@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    TenantsModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    CustomerModule,
    MenuModule,
    GeoModule,
    StoreModule,
    ConversationModule,
    OrderModule,
    MenuLinkModule,
    AiModule,
    AgentModule,
    InboundModule,
    SimulatorModule,
    DashboardModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
