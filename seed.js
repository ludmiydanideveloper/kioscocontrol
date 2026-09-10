/**
 * Carga un catálogo de demo en Supabase.
 *   node seed.js            -> inserta productos + clientes de ejemplo
 *   node seed.js --reset    -> borra ventas/movimientos/caja antes de cargar
 *
 * Lee credenciales de .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function readEnv() {
  try {
    const raw = readFileSync(new URL('./.env.local', import.meta.url), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const env = readEnv();
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);
const RESET = process.argv.includes('--reset');

const now = new Date().toISOString();

const PRODUCTS = [
  ['Golosinas', 'Alfajor Jorgito Chocolate', 'Jorgito', '7790040001015', 320, 550, 60, 15],
  ['Golosinas', 'Alfajor Guaymallén Blanco', 'Guaymallén', '7790040111111', 180, 350, 80, 20],
  ['Golosinas', 'Chocolate Milka Leger 55g', 'Milka', '7622300811111', 900, 1500, 24, 6],
  ['Golosinas', 'Chupetín Pico Dulce', 'Arcor', '7790040221122', 90, 200, 120, 30],
  ['Golosinas', 'Gomitas Mogul Frutales 30g', 'Mogul', '7790040551155', 350, 650, 40, 10],
  ['Golosinas', 'Tita x1', 'Terrabusi', '7790040661166', 200, 400, 50, 12],
  ['Golosinas', 'Rhodesia x1', 'Terrabusi', '7790040771177', 220, 420, 45, 12],
  ['Golosinas', 'Menthoplus Miel', 'Menthoplus', '7790040881188', 300, 600, 35, 10],
  ['Galletitas', 'Oreo Original 118g', 'Oreo', '7622300991199', 850, 1400, 20, 5],
  ['Galletitas', 'Criollitas 100g', 'Criollitas', '7790040121212', 400, 750, 30, 8],
  ['Galletitas', 'Toddy Clásica 130g', 'Toddy', '7790040131313', 550, 950, 25, 6],
  ['Galletitas', 'Pepitos 118g', 'Pepitos', '7790040141414', 600, 1050, 22, 6],
  ['Bebidas', 'Coca-Cola 2.25L', 'Coca-Cola', '7790895000123', 1800, 2800, 30, 8],
  ['Bebidas', 'Coca-Cola 500ml', 'Coca-Cola', '7790895000456', 800, 1400, 40, 12],
  ['Bebidas', 'Sprite 1.5L', 'Sprite', '7790895000789', 1400, 2200, 18, 6],
  ['Bebidas', 'Agua Mineral Villa del Sur 1.5L', 'Villa del Sur', '7790895011111', 600, 1100, 36, 10],
  ['Bebidas', 'Jugo Cepita Naranja 1L', 'Cepita', '7790895022222', 900, 1600, 20, 6],
  ['Bebidas', 'Energizante Speed 250ml', 'Speed', '7790895033333', 1200, 2000, 24, 8],
  ['Bebidas', 'Powerade Mora Azul 500ml', 'Powerade', '7790895044444', 1100, 1900, 15, 5],
  ['Bebidas Alcohólicas', 'Cerveza Quilmes 1L', 'Quilmes', '7790963000111', 1500, 2400, 24, 8],
  ['Bebidas Alcohólicas', 'Cerveza Brahma 473ml', 'Brahma', '7790963000222', 900, 1500, 30, 10],
  ['Bebidas Alcohólicas', 'Fernet Branca 750ml', 'Branca', '7790963000333', 9500, 13500, 6, 2],
  ['Bebidas Alcohólicas', 'Vino Tinto Toro Tetra 1L', 'Toro', '7790963000444', 1800, 2900, 12, 4],
  ['Snacks', 'Papas Lays Clásicas 145g', 'Lays', '7790310000111', 1200, 2000, 25, 6],
  ['Snacks', 'Doritos Queso 145g', 'Doritos', '7790310000222', 1300, 2100, 20, 6],
  ['Snacks', 'Palitos Pehuamar 100g', 'Pehuamar', '7790310000333', 700, 1250, 22, 6],
  ['Snacks', 'Maní Salado 100g', 'Pehuamar', '7790310000444', 500, 950, 30, 8],
  ['Cigarrillos', 'Marlboro Box 20', 'Marlboro', '7790010000111', 2600, 3200, 40, 10],
  ['Cigarrillos', 'Philip Morris Box 20', 'Philip Morris', '7790010000222', 2400, 3000, 35, 10],
  ['Cigarrillos', 'Camel Box 20', 'Camel', '7790010000333', 2700, 3300, 20, 6],
  ['Almacén', 'Yerba Mate Playadito 1kg', 'Playadito', '7790387000111', 3200, 4600, 15, 4],
  ['Almacén', 'Azúcar Ledesma 1kg', 'Ledesma', '7790387000222', 1100, 1700, 20, 5],
  ['Almacén', 'Fideos Matarazzo 500g', 'Matarazzo', '7790387000333', 700, 1200, 25, 6],
  ['Almacén', 'Arroz Gallo Oro 1kg', 'Gallo', '7790387000444', 1400, 2100, 18, 5],
  ['Almacén', 'Aceite Natura 900ml', 'Natura', '7790387000555', 2600, 3800, 12, 4],
  ['Kiosco', 'Preservativos Prime x3', 'Prime', '7790500000111', 1200, 2200, 10, 3],
  ['Kiosco', 'Pilas AA Duracell x2', 'Duracell', '7790500000222', 1800, 3000, 12, 4],
  ['Kiosco', 'Encendedor Bic', 'Bic', '7790500000333', 500, 1100, 25, 8],
  ['Limpieza', 'Lavandina Ayudín 1L', 'Ayudín', '7790600000111', 700, 1300, 15, 4],
  ['Limpieza', 'Papel Higiénico Elite x4', 'Elite', '7790600000222', 1600, 2500, 18, 5],
];

const CUSTOMERS = [
  ['cust-demo-1', 'Vecino Carlos', '5493410000001', 'Depto 3B', 4500],
  ['cust-demo-2', 'Laura (kiosco esquina)', '5493410000002', '', 0],
  ['cust-demo-3', 'Don José', '', 'Jubilado, paga los 3', 12000],
];

async function main() {
  if (RESET) {
    console.log('Borrando ventas, movimientos y caja...');
    for (const t of ['cash_movements', 'cash_sessions', 'stock_movements', 'sales', 'customer_payments', 'purchases']) {
      await supabase.from(t).delete().neq('id', '___none___');
    }
  }

  console.log(`Cargando ${PRODUCTS.length} productos...`);
  const products = PRODUCTS.map(([category, name, brand, barcode, costPrice, sellPrice, stock, minStock], i) => ({
    id: `prod-demo-${i + 1}`,
    barcode,
    name,
    category,
    brand,
    supplier: 'Distribuidora Demo',
    costPrice,
    sellPrice,
    stock,
    minStock,
    unit: 'unidad',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
  const { error: pErr } = await supabase.from('products').upsert(products, { onConflict: 'id' });
  if (pErr) return console.error('Error productos:', pErr.message);
  console.log('  productos OK');

  console.log(`Cargando ${CUSTOMERS.length} clientes...`);
  const customers = CUSTOMERS.map(([id, name, phone, notes, balance]) => ({
    id,
    name,
    phone: phone || null,
    notes: notes || null,
    balance,
    createdAt: now,
    updatedAt: now,
  }));
  const { error: cErr } = await supabase.from('customers').upsert(customers, { onConflict: 'id' });
  if (cErr) return console.error('Error clientes:', cErr.message);
  console.log('  clientes OK');

  console.log('\n✅ Base lista. Ejecutá `npm run dev`.');
}

main();
