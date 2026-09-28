-- ===========================================================================
-- Schema do Attendant. Roda no primeiro start do Postgres (docker-entrypoint)
-- E a cada boot do backend (`runMigrations`). Por isso TUDO aqui precisa ser
-- idempotente: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ou
-- DO $$ ... EXCEPTION WHEN duplicate_object $$. Mudança destrutiva (drop de
-- coluna, troca de tipo) exige reset do volume — ver CLAUDE.md.
-- ===========================================================================

-- ===========================================================================
-- 1. Multi-tenancy — tenants (restaurantes) e usuários
--
-- Todo dado de negócio pertence a um tenant. As FKs `tenant_id` são SEMPRE
-- ON DELETE CASCADE: é isso que permite ao seed se substituir com um único
-- `DELETE FROM tenants WHERE slug = ...` em vez de um TRUNCATE global.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    -- Id do número dentro da conta WhatsApp Business (NÃO é o telefone). Chega
    -- em todo webhook como `metadata.phone_number_id` e é o que diz de qual
    -- restaurante é a mensagem. NULL = restaurante ainda sem WhatsApp ligado
    -- (só o simulador funciona).
    whatsapp_phone_number_id VARCHAR(40) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- E-mail é único GLOBALMENTE, não por tenant: o formulário de login não tem
-- seletor de empresa, então o e-mail precisa resolver para exatamente um user.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (role IN ('admin'))
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

-- ===========================================================================
-- 2. Persona do atendente (uma linha POR TENANT)
--
-- Define os textos determinísticos (saudação, identidade, fallback, "não
-- entendi") e o tom que o agente segue. Tenant sem linha usa os defaults de
-- `settings.service.ts`.
-- ===========================================================================
DO $$ BEGIN
    CREATE TYPE bot_personality_enum AS ENUM (
        'friendly',
        'formal',
        'objective',
        'technical'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE bot_gender_enum AS ENUM (
        'neutral',
        'female',
        'male'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bot_settings (
    tenant_id INT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL DEFAULT 'Assistente',
    personality bot_personality_enum NOT NULL DEFAULT 'friendly',
    gender bot_gender_enum NOT NULL DEFAULT 'neutral',
    -- Idiomas que o bot fala. Hoje só 'pt-BR'; a coluna já é lista para que
    -- habilitar um novo idioma seja dado, não migração.
    languages TEXT[] NOT NULL DEFAULT ARRAY['pt-BR'],
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 3. Conversas e mensagens
--
-- Uma conversa = um contato num canal de um tenant. O canal é parte da chave
-- porque o simulador do painel e o WhatsApp real não podem misturar histórico.
-- ===========================================================================
DO $$ BEGIN
    CREATE TYPE channel_enum AS ENUM ('whatsapp', 'simulator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE message_direction_enum AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel channel_enum NOT NULL,
    -- WhatsApp: wa_id do cliente (telefone em E.164 sem '+').
    -- Simulador: 'admin-<userId>'.
    contact VARCHAR(64) NOT NULL,
    contact_name VARCHAR(160),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_conversations_contact UNIQUE (tenant_id, channel, contact)
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last
    ON conversations (tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction message_direction_enum NOT NULL,
    body TEXT NOT NULL,
    -- Id da mensagem no canal (wamid.* no WhatsApp). A Meta REENVIA webhooks
    -- quando não recebe 200 a tempo; o UNIQUE é o que impede o bot de
    -- responder duas vezes à mesma mensagem.
    external_id VARCHAR(160),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_tenant_external
    ON messages (tenant_id, external_id)
    WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at DESC);

-- ===========================================================================
-- 4. Cardápio
--
-- Item sem tamanho usa `menu_items.price_cents`; item COM tamanho ignora essa
-- coluna e usa `item_sizes.price_cents` (validado em modules/menu). `active`
-- remove do cardápio; `available` é "esgotado hoje" (manual, não some).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS menu_categories (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant
    ON menu_categories (tenant_id, position);

CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    -- NULL quando o item tem tamanhos (o preço vem de `item_sizes`).
    price_cents INT,
    image_url TEXT,
    available BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    position INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category
    ON menu_items (tenant_id, category_id, position);

CREATE TABLE IF NOT EXISTS item_sizes (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    price_cents INT NOT NULL,
    position INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_item_sizes_item
    ON item_sizes (item_id, position);

DO $$ BEGIN
    CREATE TYPE option_pricing_rule_enum AS ENUM ('sum', 'max', 'average');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `pricing_rule = 'average'` é o caso de pizza meio a meio: um grupo de
-- sabores com `max_select = 2` cobra a média dos dois em vez da soma.
CREATE TABLE IF NOT EXISTS option_groups (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    min_select INT NOT NULL DEFAULT 0,
    max_select INT NOT NULL DEFAULT 1,
    pricing_rule option_pricing_rule_enum NOT NULL DEFAULT 'sum',
    position INT NOT NULL DEFAULT 0,
    CONSTRAINT chk_option_groups_select CHECK (
        min_select >= 0 AND max_select >= min_select
    )
);

CREATE INDEX IF NOT EXISTS idx_option_groups_item
    ON option_groups (item_id, position);

CREATE TABLE IF NOT EXISTS options (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id INT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    available BOOLEAN NOT NULL DEFAULT true,
    position INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_options_group
    ON options (group_id, position);

-- ===========================================================================
-- 5. Loja — horário, pausa, entrega e bairros
--
-- Uma linha por tenant. `opening_hours` é avaliado sempre no fuso da própria
-- linha (`timezone`), nunca no fuso do servidor — ver `modules/store/store.hours.ts`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS store_settings (
    tenant_id INT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    timezone VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    -- Formato: { "mon": [["11:00","15:00"],["18:00","23:30"]], ... }.
    -- Intervalo cruzando meia-noite (["18:00","02:00"]) é válido.
    opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    paused BOOLEAN NOT NULL DEFAULT false,
    min_order_cents INT NOT NULL DEFAULT 0,
    estimated_minutes INT NOT NULL DEFAULT 40,
    pickup_enabled BOOLEAN NOT NULL DEFAULT true,
    delivery_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Subconjunto de 'pix', 'cash', 'card_on_delivery'.
    payment_methods TEXT[] NOT NULL DEFAULT ARRAY['pix', 'cash'],
    pix_key TEXT,
    owner_whatsapp VARCHAR(20),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    neighborhood VARCHAR(120) NOT NULL,
    -- Sem acento, minúsculo — o que a busca do agente compara (fase 2).
    -- Calculada e gravada pelo app (`modules/store/neighborhood.ts`), não em
    -- SQL, para a mesma função poder ser testada sem banco.
    neighborhood_key VARCHAR(120) NOT NULL,
    fee_cents INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_delivery_zones_key UNIQUE (tenant_id, neighborhood_key)
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_tenant
    ON delivery_zones (tenant_id, active);
