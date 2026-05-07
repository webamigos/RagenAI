-- prisma/seeds/atrium-products.sql
CREATE TABLE IF NOT EXISTS atrium_products (
  id                SERIAL PRIMARY KEY,
  sku               VARCHAR(50),
  name              VARCHAR(255) NOT NULL,
  wood_type         VARCHAR(10)  NOT NULL,
  color             VARCHAR(50)  NOT NULL,
  min_height_cm     INTEGER      NOT NULL,
  max_height_cm     INTEGER      NOT NULL,
  product_width_mm  INTEGER,
  product_length_mm INTEGER,
  opening_width_mm  INTEGER      NOT NULL,
  opening_length_mm INTEGER      NOT NULL,
  step_width_mm     INTEGER,
  image_url         TEXT,
  shop_url          TEXT         NOT NULL
);

TRUNCATE atrium_products RESTART IDENTITY;

INSERT INTO atrium_products
  (sku, name, wood_type, color, min_height_cm, max_height_cm,
   product_width_mm, product_length_mm, opening_width_mm, opening_length_mm,
   step_width_mm, image_url, shop_url)
VALUES
  ('M11+B',       'ATRIUM Mini Plus Lux 11el Buk',       'beech', 'Czarne', 222, 300, 700,  1570, 700,  1500, 600, 'https://atriumsystem.eu/CAPL/5907710650714-1.jpg',  'https://atriumshop.eu/schody-atrium-mini-plus-p-4.html'),
  ('M11+O',       'ATRIUM Mini Plus Lux 11el Dąb',       'oak',   'Czarne', 222, 300, 700,  1570, 700,  1500, 600, 'https://atriumsystem.eu/CAPL/5907710650745-1.jpg',  'https://atriumshop.eu/schody-atrium-mini-plus-p-4.html'),
  ('D70D40V115B', 'ATRIUM DIXI VERTICAL Buk 70cm',       'beech', 'Czarne', 222, 300, 700,  1570, 700,  1500, 600, 'https://atriumsystem.eu/CAPL/5907710653227-1.png',  'https://atriumshop.eu/schody-atrium-dixi-vertical-80-p-32.html'),
  ('D70D40V115O', 'ATRIUM DIXI VERTICAL Dąb 70cm',       'oak',   'Czarne', 222, 300, 700,  1570, 700,  1500, 600, 'https://atriumsystem.eu/CAPL/5907710653258-1.png',  'https://atriumshop.eu/schody-atrium-dixi-vertical-80-p-32.html'),
  (NULL,          'ATRIUM DIXI Buk 80cm',                'beech', 'Czarne', 222, 300, 800,  2040, 800,  2040, 700, 'https://atriumsystem.eu/CAPL/5907710648643-1.png',  'https://atriumshop.eu/schody-atrium-dixi-vertical-p-31.html'),
  (NULL,          'ATRIUM DIXI Dąb 80cm',                'oak',   'Czarne', 222, 300, 800,  2040, 800,  2040, 700, 'https://atriumsystem.eu/CAPL/5907710654057-1.png',  'https://atriumshop.eu/schody-atrium-dixi-vertical-p-31.html'),
  (NULL,          'ATRIUM MINI Dąb',                     'oak',   'Czarne', 222, 300, 700,  1570, 700,  1500, 600, 'https://atriumsystem.eu/CAPL/5907710649374-1.png',  'https://atriumshop.eu/schody-atrium-pinio-p-23.html'),
  (NULL,          'Atrium Novo 140 Buk',                 'beech', 'Szary',  271, 314, NULL, NULL, 1400, 1400, 620, 'https://atriumsystem.eu/CAPL/5907710640876-1.jpg',  'https://atriumshop.eu/schody-atrium-novo-p-18.html'),
  (NULL,          'Atrium Novo 140 Dąb',                 'oak',   'Szary',  271, 314, NULL, NULL, 1400, 1400, 620, 'https://atriumsystem.eu/CAPL/5907710641507-1.png',  'https://atriumshop.eu/schody-atrium-novo-p-18.html');
