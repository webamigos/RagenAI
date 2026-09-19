/** Stock per warehouse, what is below minimum, and what is on order. */

import { COMPANY, INBOUND_ORDERS, PRODUCTS, PRODUCT_BY_SKU, WAREHOUSES } from '../data.mjs';
import { pick } from '../format.mjs';
import { STOCK, isBelowMinimum, stockTotal } from '../numbers.mjs';

export const format = 'xlsx';

export const file = {
  pl: 'stany-magazynowe-2026-03.xlsx',
  en: 'stock-report-2026-03.xlsx',
};

const COPY = {
  pl: {
    stockSheet: 'Stany magazynowe',
    stockTitle: 'Stany magazynowe — 1 marca 2026',
    stockSubtitle: `${COMPANY.name}. Stan poniżej zapasu minimalnego oznaczony w kolumnie „Status”.`,
    stockHeaders: [
      'SKU', 'Nazwa produktu', 'M1 Poznań', 'M2 Wrocław', 'M3 Gdańsk', 'Razem',
      'Zapas min.', 'Status', 'Czas dostawy (dni rob.)', 'Ostatnia inwentaryzacja',
    ],
    below: 'poniżej minimum',
    ok: 'w normie',
    orderSheet: 'Zamówienia w drodze',
    orderTitle: 'Zamówienia u dostawców — stan na 1 marca 2026',
    orderSubtitle:
      'Pozycje zamówione i jeszcze nieprzyjęte. Kolumna „Planowana dostawa” to termin ' +
      'potwierdzony przez dostawcę.',
    orderHeaders: [
      'Nr zamówienia', 'SKU', 'Nazwa produktu', 'Ilość', 'Magazyn docelowy', 'Dostawca',
      'Planowana dostawa', 'Status',
    ],
    warehouseSheet: 'Magazyny',
    warehouseTitle: 'Magazyny',
    warehouseHeaders: ['Kod', 'Lokalizacja', 'Adres', 'Status'],
  },
  en: {
    stockSheet: 'Stock',
    stockTitle: 'Stock report — 1 March 2026',
    stockSubtitle: `${COMPANY.name}. Items below their minimum level are flagged in the "Status" column.`,
    stockHeaders: [
      'SKU', 'Product', 'M1 Poznań', 'M2 Wrocław', 'M3 Gdańsk', 'Total',
      'Minimum', 'Status', 'Lead time (working days)', 'Last stocktake',
    ],
    below: 'below minimum',
    ok: 'in range',
    orderSheet: 'On order',
    orderTitle: 'Purchase orders open — as at 1 March 2026',
    orderSubtitle:
      'Ordered and not yet received. The "Expected delivery" column is the date the supplier ' +
      'has confirmed.',
    orderHeaders: [
      'Order no.', 'SKU', 'Product', 'Quantity', 'Destination warehouse', 'Supplier',
      'Expected delivery', 'Status',
    ],
    warehouseSheet: 'Warehouses',
    warehouseTitle: 'Warehouses',
    warehouseHeaders: ['Code', 'Location', 'Address', 'Status'],
  },
};

export function build(kit, workbook, locale) {
  const s = COPY[locale];

  kit.addSheet(
    workbook,
    s.stockSheet,
    {
      title: s.stockTitle,
      subtitle: s.stockSubtitle,
      headers: s.stockHeaders,
      rows: PRODUCTS.map((product) => {
        const row = STOCK[product.sku];
        return [
          product.sku,
          pick(product.name, locale),
          row.M1,
          row.M2,
          row.M3,
          stockTotal(product.sku),
          row.minimum,
          isBelowMinimum(product.sku) ? s.below : s.ok,
          product.lead,
          row.stocktake,
        ];
      }),
      widths: [12, 40, 13, 13, 13, 10, 12, 22, 22, 22],
    },
    locale,
  );

  kit.addSheet(
    workbook,
    s.orderSheet,
    {
      title: s.orderTitle,
      subtitle: s.orderSubtitle,
      headers: s.orderHeaders,
      rows: INBOUND_ORDERS.map((order) => [
        order.order,
        order.sku,
        pick(PRODUCT_BY_SKU[order.sku].name, locale),
        order.quantity,
        `${order.warehouse} ${WAREHOUSES.find((w) => w.code === order.warehouse).city}`,
        pick(order.supplier, locale),
        pick(order.eta, locale),
        pick(order.status, locale),
      ]),
      widths: [16, 12, 38, 9, 20, 26, 20, 22],
    },
    locale,
  );

  kit.addSheet(
    workbook,
    s.warehouseSheet,
    {
      title: s.warehouseTitle,
      subtitle: COMPANY.name,
      headers: s.warehouseHeaders,
      rows: WAREHOUSES.map((warehouse) => [
        warehouse.code,
        warehouse.city,
        warehouse.address,
        pick(warehouse.status, locale),
      ]),
      widths: [10, 18, 28, 34],
    },
    locale,
  );
}
