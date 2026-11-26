-- Bølgen: produkter, lager og ordrer (Postgres, fx Neon).
-- Køres én gang mod en tom database. Beløb er i øre (59900 = 599,00 kr.).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- URL-navn, fx "bolgen-logo-hoodie". Bruges i /product/<handle> og til lokale fotos.
  handle      text NOT NULL UNIQUE,
  name        text NOT NULL,
  sub_name    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  color      text NOT NULL DEFAULT '',
  size       text NOT NULL DEFAULT '',
  price_ore  integer NOT NULL CHECK (price_ore > 0),
  -- Lageret kan aldrig blive negativt; webhooken tæller kun ned, hvis der er nok.
  stock      integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active     boolean NOT NULL DEFAULT true,
  UNIQUE (product_id, color, size)
);

CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Unik, så den samme Stripe-betaling aldrig bliver til to ordrer.
  stripe_session_id     text NOT NULL UNIQUE,
  stripe_payment_intent text,
  email                 text,
  customer_name         text,
  phone                 text,
  shipping_address      jsonb,
  amount_total_ore      integer NOT NULL,
  currency              text NOT NULL DEFAULT 'dkk',
  -- paid: betalt, skal sendes. needs_attention: betalt, men lageret rakte ikke.
  status                text NOT NULL DEFAULT 'paid'
                        CHECK (status IN ('paid', 'needs_attention', 'shipped', 'refunded')),
  tracking              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  shipped_at            timestamptz
);

CREATE TABLE order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  variant_id     uuid REFERENCES variants (id) ON DELETE SET NULL,
  -- Kopi af navn og pris på købstidspunktet, så ordren ikke ændrer sig, hvis varen gør.
  description    text NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price_ore integer NOT NULL
);

CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX order_items_order_idx ON order_items (order_id);
