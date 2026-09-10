import type { Product, Customer } from '../types';

const now = new Date().toISOString();

const RAW: [Product['category'], string, string, string, number, number, number, number][] = [
  ['Golosinas', 'Alfajor Jorgito Chocolate', 'Jorgito', '7790040001015', 320, 550, 60, 15],
  ['Golosinas', 'Alfajor Guaymallén Blanco', 'Guaymallén', '7790040111111', 180, 350, 12, 20],
  ['Golosinas', 'Chocolate Milka Leger 55g', 'Milka', '7622300811111', 900, 1500, 24, 6],
  ['Golosinas', 'Chupetín Pico Dulce', 'Arcor', '7790040221122', 90, 200, 120, 30],
  ['Golosinas', 'Gomitas Mogul Frutales 30g', 'Mogul', '7790040551155', 350, 650, 3, 10],
  ['Golosinas', 'Tita x1', 'Terrabusi', '7790040661166', 200, 400, 50, 12],
  ['Galletitas', 'Oreo Original 118g', 'Oreo', '7622300991199', 850, 1400, 20, 5],
  ['Galletitas', 'Criollitas 100g', 'Criollitas', '7790040121212', 400, 750, 30, 8],
  ['Galletitas', 'Toddy Clásica 130g', 'Toddy', '7790040131313', 550, 950, 0, 6],
  ['Bebidas', 'Coca-Cola 2.25L', 'Coca-Cola', '7790895000123', 1800, 2800, 30, 8],
  ['Bebidas', 'Coca-Cola 500ml', 'Coca-Cola', '7790895000456', 800, 1400, 40, 12],
  ['Bebidas', 'Agua Mineral Villa del Sur 1.5L', 'Villa del Sur', '7790895011111', 600, 1100, 36, 10],
  ['Bebidas', 'Energizante Speed 250ml', 'Speed', '7790895033333', 1200, 2000, 24, 8],
  ['Bebidas Alcohólicas', 'Cerveza Quilmes 1L', 'Quilmes', '7790963000111', 1500, 2400, 24, 8],
  ['Bebidas Alcohólicas', 'Fernet Branca 750ml', 'Branca', '7790963000333', 9500, 13500, 6, 2],
  ['Snacks', 'Papas Lays Clásicas 145g', 'Lays', '7790310000111', 1200, 2000, 25, 6],
  ['Snacks', 'Doritos Queso 145g', 'Doritos', '7790310000222', 1300, 2100, 4, 6],
  ['Cigarrillos', 'Marlboro Box 20', 'Marlboro', '7790010000111', 2600, 3200, 40, 10],
  ['Cigarrillos', 'Philip Morris Box 20', 'Philip Morris', '7790010000222', 2400, 3000, 35, 10],
  ['Almacén', 'Yerba Mate Playadito 1kg', 'Playadito', '7790387000111', 3200, 4600, 15, 4],
  ['Almacén', 'Azúcar Ledesma 1kg', 'Ledesma', '7790387000222', 1100, 1700, 20, 5],
  ['Kiosco', 'Pilas AA Duracell x2', 'Duracell', '7790500000222', 1800, 3000, 12, 4],
  ['Kiosco', 'Encendedor Bic', 'Bic', '7790500000333', 500, 1100, 25, 8],
  ['Limpieza', 'Papel Higiénico Elite x4', 'Elite', '7790600000222', 1600, 2500, 18, 5],
];

export const DEMO_PRODUCTS: Product[] = RAW.map(
  ([category, name, brand, barcode, costPrice, sellPrice, stock, minStock], i) => ({
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
  }),
);

export const DEMO_CUSTOMERS: Customer[] = [
  { id: 'cust-demo-1', name: 'Vecino Carlos', phone: '5493410000001', notes: 'Depto 3B', balance: 4500, createdAt: now },
  { id: 'cust-demo-2', name: 'Laura (kiosco esquina)', phone: '5493410000002', notes: null, balance: 0, createdAt: now },
  { id: 'cust-demo-3', name: 'Don José', phone: null, notes: 'Jubilado, paga los 3', balance: 12000, createdAt: now },
];
