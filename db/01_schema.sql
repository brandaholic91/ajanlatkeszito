-- Ajánlatkészítő: táblák.
-- Minden ár nettó forint. Az áfát a price_quote() függvény számolja rá (02_pricing.sql).

-- Az árlista. Egy sor = egy megrendelhető tétel.
CREATE TABLE products (
    sku            text PRIMARY KEY,           -- rövid azonosító, ezt adja vissza a nyelvi modell
    name           text NOT NULL,              -- ez kerül a PDF-be
    category       text NOT NULL,              -- mobil | internet | eszkoz | felho | uzemeltetes
    unit           text NOT NULL,              -- db | fő | telephely
    monthly_net_12 integer NOT NULL DEFAULT 0, -- havidíj 12 hónapos hűségidővel
    monthly_net_24 integer NOT NULL DEFAULT 0, -- havidíj 24 hónapos hűségidővel (olcsóbb)
    one_time_net   integer NOT NULL DEFAULT 0, -- egyszeri díj (eszköz ára, telepítés)
    discountable   boolean NOT NULL DEFAULT true,
    hint           text NOT NULL DEFAULT ''    -- segítség a modellnek: mikor ezt a tételt válassza
);

-- Mennyiségi kedvezmény. A sáv a kategória ÖSSZES darabszámán múlik:
-- 30 Plusz + 10 Korlátlan mobil = 40 db, tehát mindkettő a 25 db-os sávba esik.
CREATE TABLE volume_discounts (
    category     text NOT NULL,
    min_qty      integer NOT NULL,
    discount_pct numeric(4, 1) NOT NULL,
    PRIMARY KEY (category, min_qty)
);

-- Egy beérkezett ajánlatkérés és az útja a folyamaton.
CREATE TABLE requests (
    id         bigserial PRIMARY KEY,
    public_id  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- ezt látja a demóoldal; nem kitalálható, mint a sorszám
    created_at timestamptz NOT NULL DEFAULT now(),
    email      text NOT NULL,
    raw_text   text NOT NULL,                    -- amit a néző beírt
    status     text NOT NULL DEFAULT 'received', -- received | extracted | priced | needs_clarification | approved | sent | failed
    extracted  jsonb,                            -- a nyelvi modell kimenete (2. lépés)
    problems   jsonb,                            -- az ellenőrzés találatai (4. lépés)
    pdf_key    text                              -- a kiküldött PDF helye az objektumtárolóban (6. lépés)
);

-- Lépésnapló: egy sor = egy elkészült lépés. Ebből rajzolja ki a demóoldal a folyamatot és az órát.
-- Lépések: received | extracted | checked | priced | needs_clarification (a 2. naptól: approved, pdf_ready, sent ...)
CREATE TABLE request_events (
    id         bigserial PRIMARY KEY,
    request_id bigint NOT NULL REFERENCES requests (id),
    step       text NOT NULL,
    -- clock_timestamp() a valódi pillanat; a now() egy tranzakción belül végig ugyanazt adná
    at         timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX request_events_request_idx ON request_events (request_id, id);

-- A kiszámolt ajánlat. Ha a kérésben nincs hűségidő, egy kéréshez két sor készül (12 és 24 hónap).
CREATE SEQUENCE quote_number_seq;

CREATE TABLE quotes (
    id          bigserial PRIMARY KEY,
    request_id  bigint NOT NULL REFERENCES requests (id),
    number      text NOT NULL UNIQUE,            -- AJ-2026-0001
    term_months integer NOT NULL CHECK (term_months IN (12, 24)),
    created_at  timestamptz NOT NULL DEFAULT now(),
    valid_until date NOT NULL DEFAULT (current_date + 15),
    priced      jsonb NOT NULL                   -- a price_quote() teljes kimenete: sorok és összesítő
);
