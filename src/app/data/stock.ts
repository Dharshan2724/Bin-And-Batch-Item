/**
 * BIN, BATCH & SERIAL DETAILS AT TRANSACTION — the prototype's stock.
 *
 * Every item sits in BINS inside a warehouse. A batch-tracked item's stock is
 * split into batches, each in a bin; a serial-tracked item's stock is one unit
 * per serial, each in a bin; an untracked item is just a quantity per bin.
 *
 * When an invoice line asks for a quantity, `allocate` decides which stock it
 * takes — earliest expiry first for batches (FEFO), then bin order — and that
 * allocation is what "View Inventory Details" shows for the current
 * invoice. Past invoices carry the allocation they were saved with.
 */

export type Tracking = 'none' | 'batch' | 'serial';

export interface Batch {
  number: string;
  bin: string;
  qty: number;
  manufactured: string;
  expiry: string;
}

export interface Serial {
  number: string;
  bin: string;
}

export interface StockItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  rate: number;
  tracking: Tracking;
  /** Per warehouse. */
  stock: Record<string, { bins: { bin: string; qty: number }[]; batches?: Batch[]; serials?: Serial[] }>;
}

export const WAREHOUSES = ['Warehouse 1', 'Warehouse 2'];

export const ITEMS: StockItem[] = [
  {
    id: 'product-2', name: 'a Product - 2', sku: 'PRD-0002', unit: 'lb', rate: 0, tracking: 'batch',
    stock: {
      'Warehouse 1': {
        bins: [{ bin: 'A1-R2-S3', qty: 2 }, { bin: 'A1-R2-S4', qty: 1 }],
        batches: [
          { number: 'BT-0925-A', bin: 'A1-R2-S3', qty: 2, manufactured: '12 Sep 2026', expiry: '30 Jun 2027' },
          { number: 'BT-1025-B', bin: 'A1-R2-S4', qty: 1, manufactured: '08 Oct 2026', expiry: '31 Aug 2027' },
        ],
      },
      //  Many small batches over several bins — the case the popover has to
      //  scroll for (INV-000008 takes 10 lb from here).
      'Warehouse 2': {
        bins: [{ bin: 'B2-R1-S1', qty: 4 }, { bin: 'B2-R1-S2', qty: 3 }, { bin: 'B2-R2-S1', qty: 4 }, { bin: 'B2-R3-S4', qty: 3 }],
        batches: [
          { number: 'BT-0725-D', bin: 'B2-R1-S1', qty: 2, manufactured: '02 Jul 2026', expiry: '31 Jan 2027' },
          { number: 'BT-0825-E', bin: 'B2-R1-S1', qty: 2, manufactured: '06 Aug 2026', expiry: '28 Feb 2027' },
          { number: 'BT-0825-F', bin: 'B2-R1-S2', qty: 1, manufactured: '19 Aug 2026', expiry: '31 Mar 2027' },
          { number: 'BT-0925-G', bin: 'B2-R1-S2', qty: 2, manufactured: '03 Sep 2026', expiry: '30 Apr 2027' },
          { number: 'BT-0925-H', bin: 'B2-R2-S1', qty: 2, manufactured: '17 Sep 2026', expiry: '31 May 2027' },
          { number: 'BT-1025-C', bin: 'B2-R2-S1', qty: 2, manufactured: '20 Oct 2026', expiry: '31 Oct 2027' },
          { number: 'BT-1025-J', bin: 'B2-R3-S4', qty: 3, manufactured: '27 Oct 2026', expiry: '30 Nov 2027' },
        ],
      },
    },
  },
  {
    id: 'scanner', name: 'Wireless Barcode Scanner', sku: 'WBS-200', unit: 'pcs', rate: 89, tracking: 'serial',
    stock: {
      'Warehouse 1': {
        bins: [{ bin: 'C3-R1-S2', qty: 3 }, { bin: 'C3-R1-S3', qty: 2 }],
        serials: [
          { number: 'SN-WBS-88201', bin: 'C3-R1-S2' },
          { number: 'SN-WBS-88202', bin: 'C3-R1-S2' },
          { number: 'SN-WBS-88203', bin: 'C3-R1-S2' },
          { number: 'SN-WBS-88214', bin: 'C3-R1-S3' },
          { number: 'SN-WBS-88215', bin: 'C3-R1-S3' },
        ],
      },
      'Warehouse 2': {
        bins: [{ bin: 'D1-R4-S1', qty: 2 }],
        serials: [
          { number: 'SN-WBS-90110', bin: 'D1-R4-S1' },
          { number: 'SN-WBS-90111', bin: 'D1-R4-S1' },
        ],
      },
    },
  },
  {
    id: 'tape', name: 'Packing Tape 48mm', sku: 'PKT-48', unit: 'rolls', rate: 3.5, tracking: 'none',
    stock: {
      'Warehouse 1': { bins: [{ bin: 'E1-R1-S1', qty: 40 }, { bin: 'E1-R1-S2', qty: 25 }] },
      'Warehouse 2': { bins: [{ bin: 'F2-R2-S1', qty: 60 }] },
    },
  },
];

export const itemById = (id: string | undefined) => ITEMS.find((i) => i.id === id);

export const onHand = (item: StockItem, warehouse: string) =>
  (item.stock[warehouse]?.bins ?? []).reduce((n, b) => n + b.qty, 0);

export interface Allocation {
  bins: { bin: string; qty: number }[];
  batches: (Batch & { take: number })[];
  serials: Serial[];
  /** What could not be covered from stock. */
  short: number;
}

const byExpiry = (a: Batch, b: Batch) => Date.parse(a.expiry) - Date.parse(b.expiry);

/** Which stock a line of `qty` takes from `warehouse`. */
export function allocate(item: StockItem, warehouse: string, qty: number): Allocation {
  const s = item.stock[warehouse];
  const out: Allocation = { bins: [], batches: [], serials: [], short: 0 };
  if (!s || !(qty > 0)) return out;
  let left = qty;
  const addBin = (bin: string, n: number) => {
    const hit = out.bins.find((b) => b.bin === bin);
    if (hit) hit.qty += n; else out.bins.push({ bin, qty: n });
  };
  if (item.tracking === 'batch') {
    for (const b of [...(s.batches ?? [])].sort(byExpiry)) {
      if (left <= 0) break;
      const take = Math.min(b.qty, left);
      out.batches.push({ ...b, take });
      addBin(b.bin, take);
      left -= take;
    }
  } else if (item.tracking === 'serial') {
    for (const sn of (s.serials ?? []).slice(0, Math.floor(left))) {
      out.serials.push(sn);
      addBin(sn.bin, 1);
      left -= 1;
    }
  } else {
    for (const b of s.bins) {
      if (left <= 0) break;
      const take = Math.min(b.qty, left);
      addBin(b.bin, take);
      left -= take;
    }
  }
  out.short = Math.max(0, left);
  return out;
}

export interface PastInvoice {
  number: string;
  date: string;
  status: 'DRAFT' | 'SENT' | 'PAID';
  customer: string;
  itemId: string;
  warehouse: string;
  qty: number;
  price: number;
  discount: number;
}

/** Earlier invoices for the item, shown below the current one. */
export const PAST_INVOICES: PastInvoice[] = [
  { number: 'INV-000008', date: '03 Nov 2026', status: 'SENT', customer: 'Shopify - Customer', itemId: 'product-2', warehouse: 'Warehouse 2', qty: 10, price: 0, discount: 0 },
  { number: 'INV-000007', date: '28 Oct 2026', status: 'PAID', customer: 'Shopify - Customer', itemId: 'product-2', warehouse: 'Warehouse 1', qty: 2, price: 0, discount: 0 },
  { number: 'INV-000004', date: '14 Oct 2026', status: 'SENT', customer: 'Bluebird Retail', itemId: 'product-2', warehouse: 'Warehouse 2', qty: 1, price: 0, discount: 0 },
  { number: 'INV-000006', date: '22 Oct 2026', status: 'PAID', customer: 'Shopify - Customer', itemId: 'scanner', warehouse: 'Warehouse 1', qty: 2, price: 89, discount: 0 },
  { number: 'INV-000005', date: '18 Oct 2026', status: 'SENT', customer: 'Shopify - Customer', itemId: 'tape', warehouse: 'Warehouse 1', qty: 12, price: 3.5, discount: 0 },
];

export const CUSTOMERS = [
  { value: 'Shopify - Customer', label: 'Shopify - Customer' },
  { value: 'Bluebird Retail', label: 'Bluebird Retail' },
];

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export const qty2 = (n: number) => n.toFixed(2);
