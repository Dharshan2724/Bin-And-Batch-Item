import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * INVENTORY STATUS — the prototype's one source of truth.
 *
 * The wireframe's flow is four steps on four different screens — create a
 * status in Settings, move stock into it, receive stock straight into it on a
 * bill, read the breakdown on the item — and each step has to SEE what the one
 * before it did. So every screen reads and writes this store, and nothing
 * keeps its own copy of a quantity.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 * Stock is a list of LOTS: a quantity of one item, at one location, in one
 * status. A batch-tracked item's lot also names its batch; a serial-tracked
 * item has one lot per serial number, so a serial can change status on its own.
 * Every number on every screen is a sum over lots — nothing is stored twice.
 *
 * A status is either AVAILABLE FOR COMMITMENT or not. That one flag is the
 * whole bridge to the stock columns the item page already has:
 *
 *   Stock on Hand          = every lot
 *   Not Available for Sale = lots in a status that cannot be committed
 *   Available Stock        = lots in a status that can
 *   Available for Sale     = Available Stock − Committed Stock
 *
 * And the context frame's rule decides what this is for: *use status when the
 * item still exists but its usability changed; use adjustment when the on-hand
 * quantity or value must be corrected.* A status change never alters Stock on
 * Hand — it only moves stock between the two middle columns.
 */

export interface InventoryStatus {
  id: string;
  name: string;
  description: string;
  /** Counts towards Available Stock, and so can be committed to a sales order. */
  committable: boolean;
  active: boolean;
  /** The default every untracked receipt lands in. Cannot be deactivated. */
  system?: boolean;
}

export type Tracking = 'none' | 'serial' | 'batch';

export interface Item {
  id: string;
  name: string;
  sku: string;
  tracking: Tracking;
  unit: string;
  rate: number;
  /** A leaf of `CATEGORIES`. */
  category: string;
}

/**
 * Two levels, so "Include sub-categories" in Add Items in Bulk means
 * something: Tableware holds no items of its own, only its children's.
 */
export const CATEGORIES: { id: string; label: string; parent?: string }[] = [
  { id: 'tableware', label: 'Tableware' },
  { id: 'plates', label: 'Plates', parent: 'tableware' },
  { id: 'cups', label: 'Cups & Mugs', parent: 'tableware' },
  { id: 'appliances', label: 'Appliances' },
];

/** The category and, if asked, every category beneath it. */
export const categoryScope = (id: string, withChildren: boolean) => new Set([
  id, ...(withChildren ? CATEGORIES.filter((c) => c.parent === id).map((c) => c.id) : []),
]);

export interface Lot {
  id: string;
  itemId: string;
  location: string;
  statusId: string;
  qty: number;
  batch?: string;
  serial?: string;
  manufactured?: string;
  expiry?: string;
}

export interface StatusChange {
  id: string;
  /** The record's own number — "IS-00012". What its detail view is titled. */
  number: string;
  /** ISO date. */
  date: string;
  itemId: string;
  qty: number;
  location: string;
  /** `null` for stock that arrived — it had no status before. */
  from: string | null;
  to: string;
  /** "Status update" or the bill it was received on. */
  reference: string;
  note?: string;
  /** The batch or serial numbers that moved, when tracked. */
  detail?: string;
  /** Per batch or serial, how much moved. Absent on seed rows — see `partsOf`. */
  parts?: { ref: string; qty: number }[];
}

/**
 * What moved, per batch or serial. Rows written by this store carry `parts`;
 * the seed rows only have `detail`, which is either ONE batch (it holds the
 * whole quantity) or a list of serials (one each).
 */
export function partsOf(h: StatusChange): { ref: string; qty: number }[] {
  if (h.parts?.length) return h.parts;
  const refs = (h.detail ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (refs.length === 1) return [{ ref: refs[0], qty: h.qty }];
  return refs.map((ref) => ({ ref, qty: 1 }));
}

const IS_PREFIX = 'IS-';
const isNumber = (n: number) => `${IS_PREFIX}${String(n).padStart(5, '0')}`;
/** The next `count` numbers after the highest already issued. */
const nextNumbers = (h: StatusChange[], count: number) => {
  const top = h.reduce((m, x) => Math.max(m, Number(x.number.slice(IS_PREFIX.length)) || 0), 0);
  return Array.from({ length: count }, (_, k) => isNumber(top + k + 1));
};

export const LOCATIONS = ['Head Office', 'Chennai Warehouse', 'Bengaluru Store'];

export const ITEMS: Item[] = [
  { id: 'plate', name: 'Ceramic Plate', sku: 'CER-PLT-01', tracking: 'none', unit: 'pcs', rate: 180, category: 'plates' },
  { id: 'cup', name: 'Ceramic Cup', sku: 'CER-CUP-01', tracking: 'none', unit: 'pcs', rate: 120, category: 'cups' },
  { id: 'ribbed', name: 'Ceramic Ribbed Plate', sku: 'CER-RPL-02', tracking: 'batch', unit: 'pcs', rate: 240, category: 'plates' },
  { id: 'mug', name: 'Stoneware Mug', sku: 'STN-MUG-04', tracking: 'batch', unit: 'pcs', rate: 210, category: 'cups' },
  { id: 'kettle', name: 'Electric Kettle', sku: 'ELK-1L-09', tracking: 'serial', unit: 'pcs', rate: 1899, category: 'appliances' },
];

/** Committed to open sales orders. Fixed — this prototype does not sell. */
export const COMMITTED: Record<string, Record<string, number>> = {
  plate: { 'Head Office': 20 },
  cup: { 'Head Office': 5, 'Chennai Warehouse': 4 },
  ribbed: { 'Head Office': 12 },
  mug: { 'Bengaluru Store': 6 },
  kettle: { 'Head Office': 2 },
};

const SEED_STATUSES: InventoryStatus[] = [
  {
    id: 'available', name: 'Available Stock', committable: true, active: true, system: true,
    description: 'Inventory that is in stock, not reserved for other customers, and ready to be sold or shipped.',
  },
  {
    id: 'reserved', name: 'Reserved', committable: false, active: true,
    description: 'The stock is reserved for various purposes.',
  },
  {
    id: 'damaged', name: 'Damaged', committable: false, active: true,
    description: 'The stock is damaged and isolated for return.',
  },
  {
    id: 'blocked', name: 'Blocked', committable: false, active: true,
    description: 'This stock is reserved for a particular order, and will not be available for sale.',
  },
];

let seq = 0;
const uid = (p: string) => `${p}-${(seq += 1)}`;

const lot = (itemId: string, location: string, statusId: string, qty: number, extra: Partial<Lot> = {}): Lot => ({
  id: uid('lot'), itemId, location, statusId, qty, ...extra,
});

const serials = (location: string, statusId: string, from: number, count: number) =>
  Array.from({ length: count }, (_, i) => lot('kettle', location, statusId, 1, {
    serial: `SN-${String(from + i).padStart(4, '0')}`,
  }));

const SEED_LOTS: Lot[] = [
  //  Head Office matches the item-details frame: 110 on hand, 10 not available
  //  for sale, 100 available, 20 committed, 80 available for sale.
  lot('plate', 'Head Office', 'available', 100),
  lot('plate', 'Head Office', 'reserved', 6),
  lot('plate', 'Head Office', 'damaged', 4),
  lot('plate', 'Chennai Warehouse', 'available', 35),
  lot('cup', 'Head Office', 'available', 48),
  lot('cup', 'Head Office', 'blocked', 5),
  lot('cup', 'Chennai Warehouse', 'available', 22),
  lot('cup', 'Chennai Warehouse', 'damaged', 10),
  lot('ribbed', 'Head Office', 'available', 40, { batch: '23 b1', manufactured: '2026-08-02', expiry: '2028-08-01' }),
  lot('ribbed', 'Head Office', 'available', 30, { batch: '23 b2', manufactured: '2026-08-19', expiry: '2028-08-18' }),
  lot('ribbed', 'Head Office', 'reserved', 10, { batch: '23 b3', manufactured: '2026-09-04', expiry: '2028-09-03' }),
  lot('ribbed', 'Chennai Warehouse', 'available', 25, { batch: '23 b4', manufactured: '2026-09-21', expiry: '2028-09-20' }),
  lot('ribbed', 'Chennai Warehouse', 'damaged', 6, { batch: '23 b5', manufactured: '2026-10-03', expiry: '2028-10-02' }),
  lot('mug', 'Bengaluru Store', 'available', 60, { batch: 'MG-2610', manufactured: '2026-10-01', expiry: '2029-09-30' }),
  lot('mug', 'Bengaluru Store', 'blocked', 12, { batch: 'MG-2611', manufactured: '2026-10-14', expiry: '2029-10-13' }),
  ...serials('Head Office', 'available', 1, 6),
  ...serials('Head Office', 'damaged', 7, 1),
  ...serials('Chennai Warehouse', 'available', 8, 3),
];

const SEED_HISTORY_RAW: Omit<StatusChange, 'number'>[] = [
  { id: uid('h'), date: '2026-11-02', itemId: 'plate', qty: 4, location: 'Head Office', from: 'available', to: 'damaged', reference: 'Status update', note: 'Chipped in transit' },
  { id: uid('h'), date: '2026-11-01', itemId: 'cup', qty: 5, location: 'Head Office', from: 'available', to: 'blocked', reference: 'Status update', note: 'Held for SO-00231' },
  { id: uid('h'), date: '2026-11-03', itemId: 'ribbed', qty: 10, location: 'Head Office', from: 'available', to: 'reserved', reference: 'Status update', detail: '23 b3' },
  { id: uid('h'), date: '2026-11-01', itemId: 'ribbed', qty: 25, location: 'Chennai Warehouse', from: 'reserved', to: 'available', reference: 'Status update', detail: '23 b4' },
  { id: uid('h'), date: '2026-11-01', itemId: 'plate', qty: 6, location: 'Head Office', from: 'available', to: 'reserved', reference: 'Status update' },
  { id: uid('h'), date: '2026-11-02', itemId: 'cup', qty: 10, location: 'Chennai Warehouse', from: null, to: 'damaged', reference: 'BL-00042' },
  { id: uid('h'), date: '2026-11-02', itemId: 'mug', qty: 60, location: 'Bengaluru Store', from: null, to: 'available', reference: 'BL-00042', detail: 'MG-2610' },
  { id: uid('h'), date: '2026-11-02', itemId: 'kettle', qty: 3, location: 'Chennai Warehouse', from: null, to: 'available', reference: 'BL-00042', detail: 'SN-0008, SN-0009, SN-0010' },
  { id: uid('h'), date: '2026-10-21', itemId: 'cup', qty: 22, location: 'Chennai Warehouse', from: null, to: 'available', reference: 'BL-00040' },
  { id: uid('h'), date: '2026-10-06', itemId: 'kettle', qty: 1, location: 'Head Office', from: 'available', to: 'damaged', reference: 'Status update', detail: 'SN-0007' },
  { id: uid('h'), date: '2026-09-27', itemId: 'mug', qty: 12, location: 'Bengaluru Store', from: 'available', to: 'blocked', reference: 'Status update', detail: 'MG-2611' },
];

//  Numbered oldest first, so a later record always has a higher number.
const SEED_ORDER = [...SEED_HISTORY_RAW].sort((a, b) => a.date.localeCompare(b.date));
const SEED_HISTORY: StatusChange[] = SEED_HISTORY_RAW.map((h) => ({
  ...h, number: isNumber(SEED_ORDER.indexOf(h) + 1),
}));

/* ── The status-change list ───────────────────────────────────────────────── */

//  Shared by the stats page and the detail view's mini list, because the mini
//  list IS that page's list: the same period, the same location, the same order.
export const STATS_PERIODS = [
  { id: 'month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'all', label: 'All Time' },
] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number]['id'];
export interface StatsFilter { period: StatsPeriod; location: string }

const inPeriod = (iso: string, period: StatsPeriod) => {
  const d = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month') return d.getFullYear() === y && d.getMonth() === m;
  if (period === 'last-month') {
    const lm = new Date(y, m - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (period === 'quarter') return d.getFullYear() === y && Math.floor(d.getMonth() / 3) === Math.floor(m / 3);
  return true;
};

/** Newest first. `sort` is stable, so same-day rows keep the order they were recorded in. */
export function changesIn(history: StatusChange[], { period, location }: StatsFilter): StatusChange[] {
  return history
    .filter((h) => inPeriod(h.date, period) && (location === 'all' || h.location === location))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Derived numbers ─────────────────────────────────────────────────────── */

export interface StockRow {
  location: string;
  onHand: number;
  notForSale: number;
  available: number;
  committed: number;
  forSale: number;
  byStatus: Record<string, number>;
}

/** One row per location for an item, in `LOCATIONS` order. */
export function stockByLocation(lots: Lot[], statuses: InventoryStatus[], itemId: string): StockRow[] {
  const committable = new Set(statuses.filter((s) => s.committable).map((s) => s.id));
  return LOCATIONS.map((location) => {
    const here = lots.filter((l) => l.itemId === itemId && l.location === location);
    const byStatus: Record<string, number> = {};
    for (const l of here) byStatus[l.statusId] = (byStatus[l.statusId] ?? 0) + l.qty;
    const onHand = here.reduce((n, l) => n + l.qty, 0);
    const available = here.filter((l) => committable.has(l.statusId)).reduce((n, l) => n + l.qty, 0);
    const committed = COMMITTED[itemId]?.[location] ?? 0;
    return {
      location, onHand, available, committed, byStatus,
      notForSale: onHand - available,
      forSale: Math.max(available - committed, 0),
    };
  });
}

export function qtyIn(lots: Lot[], itemId: string, location: string, statusId: string): number {
  return lots
    .filter((l) => l.itemId === itemId && l.location === location && l.statusId === statusId)
    .reduce((n, l) => n + l.qty, 0);
}

/* ── Operations ──────────────────────────────────────────────────────────── */

export interface MoveLine {
  itemId: string;
  qty: number;
  to: string;
  /** Batch-tracked: which batches, and how much of each. Must add up to `qty`. */
  batches?: { batch: string; qty: number }[];
  /** Serial-tracked: which serials. Their count must equal `qty`. */
  serials?: string[];
}

/** The batches of an item in one status at one location, with what each holds. */
export function batchesIn(lots: Lot[], itemId: string, location: string, statusId: string) {
  const by = new Map<string, Lot & { qty: number }>();
  for (const l of lots) {
    if (l.itemId !== itemId || l.location !== location || l.statusId !== statusId || !l.batch) continue;
    const had = by.get(l.batch);
    by.set(l.batch, had ? { ...had, qty: had.qty + l.qty } : { ...l });
  }
  return [...by.values()].filter((l) => l.qty > 0);
}

/** The serial numbers of an item in one status at one location. */
export function serialsIn(lots: Lot[], itemId: string, location: string, statusId: string) {
  return lots
    .filter((l) => l.itemId === itemId && l.location === location && l.statusId === statusId && l.serial && l.qty > 0)
    .map((l) => l.serial as string);
}

export interface ReceiveLine {
  itemId: string;
  statusId: string;
  qty: number;
  batch?: string;
  serials?: string[];
  manufactured?: string;
  expiry?: string;
}


/**
 * Move stock from one status to another. Returns an error per line index that
 * could not be moved, or an empty object when every line went through — and in
 * that case only. A half-applied update is worse than a refused one.
 */
function planMove(
  lots: Lot[], location: string, from: string, lines: MoveLine[],
): { errors: Record<number, string>; next: Lot[] } {
  const errors: Record<number, string> = {};
  const next = lots.map((l) => ({ ...l }));

  lines.forEach((line, i) => {
    const item = ITEMS.find((x) => x.id === line.itemId);
    if (!item) { errors[i] = 'Choose an item.'; return; }
    if (!line.to) { errors[i] = 'Choose the status to move it to.'; return; }
    if (line.to === from) { errors[i] = 'The new status is the same as the current one.'; return; }

    if (item.tracking === 'serial') {
      const wanted = line.serials ?? [];
      if (!wanted.length) { errors[i] = 'Select the serial numbers to move.'; return; }
      if (line.qty > 0 && wanted.length !== line.qty) {
        errors[i] = `${wanted.length} serial ${wanted.length === 1 ? 'number' : 'numbers'} selected for a quantity of ${line.qty}.`;
        return;
      }
      const missing = wanted.filter((sn) => !next.some((l) =>
        l.itemId === item.id && l.location === location && l.statusId === from && l.serial === sn));
      if (missing.length) { errors[i] = `${missing.join(', ')} not in this status here.`; return; }
      for (const l of next) {
        if (l.itemId === item.id && l.location === location && l.serial && wanted.includes(l.serial)) l.statusId = line.to;
      }
      return;
    }

    if (!(line.qty > 0)) { errors[i] = 'Enter a quantity.'; return; }

    //  A batch-tracked line is one PART per picked batch; an untracked line is
    //  one part drawn from every lot. Each part is checked against what is
    //  actually in that batch, so the error can name the batch that is short.
    let parts: { batch?: string; qty: number }[] = [{ qty: line.qty }];
    if (item.tracking === 'batch') {
      const picked = (line.batches ?? []).filter((b) => b.batch && b.qty > 0);
      if (!picked.length) { errors[i] = 'Select the batches to move.'; return; }
      const sum = picked.reduce((n, b) => n + b.qty, 0);
      if (sum !== line.qty) {
        errors[i] = `The batches add up to ${sum} ${item.unit}; the quantity is ${line.qty}.`;
        return;
      }
      parts = picked;
    }

    const pools = parts.map((p) => next.filter((l) => l.itemId === item.id && l.location === location
      && l.statusId === from && (p.batch === undefined || l.batch === p.batch)));
    const short = parts.findIndex((p, k) => p.qty > pools[k].reduce((n, l) => n + l.qty, 0));
    if (short >= 0) {
      const have = pools[short].reduce((n, l) => n + l.qty, 0);
      const p = parts[short];
      errors[i] = p.batch
        ? `Batch ${p.batch} has only ${have} ${item.unit} in this status here.`
        : `Only ${have} ${item.unit} in this status here.`;
      return;
    }

    parts.forEach((p, k) => {
      let left = p.qty;
      for (const l of pools[k]) {
        if (!left) break;
        const take = Math.min(l.qty, left);
        l.qty -= take;
        left -= take;
        const into = next.find((m) => m.itemId === l.itemId && m.location === l.location
          && m.statusId === line.to && m.batch === l.batch);
        if (into) into.qty += take;
        else next.push({ ...l, id: uid('lot'), statusId: line.to, qty: take });
      }
    });
  });

  return { errors, next: next.filter((l) => l.qty > 0) };
}

/* ── The store ───────────────────────────────────────────────────────────── */

interface Store {
  statuses: InventoryStatus[];
  lots: Lot[];
  history: StatusChange[];
  billCount: number;
  saveStatus: (s: Omit<InventoryStatus, 'id'> & { id?: string }) => InventoryStatus;
  moveStock: (args: { location: string; from: string; note: string; lines: MoveLine[] }) => Record<number, string>;
  receive: (args: { bill: string; location: string; lines: ReceiveLine[] }) => void;
}

const Ctx = createContext<Store | null>(null);

const today = () => new Date().toISOString().slice(0, 10);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState(SEED_STATUSES);
  const [lots, setLots] = useState(SEED_LOTS);
  const [history, setHistory] = useState(SEED_HISTORY);
  const [billCount, setBillCount] = useState(42);

  const store = useMemo<Store>(() => ({
    statuses, lots, history, billCount,

    saveStatus: (s) => {
      const saved = { ...s, id: s.id ?? uid('status') } as InventoryStatus;
      setStatuses((all) => (all.some((x) => x.id === saved.id)
        ? all.map((x) => (x.id === saved.id ? saved : x))
        : [...all, saved]));
      return saved;
    },

    moveStock: ({ location, from, note, lines }) => {
      const { errors, next } = planMove(lots, location, from, lines);
      if (Object.keys(errors).length) return errors;
      setLots(next);
      setHistory((h) => {
        const numbers = nextNumbers(h, lines.length);
        return [
        ...lines.map((line, k) => {
          const tracked = ITEMS.find((x) => x.id === line.itemId)?.tracking;
          return {
            id: uid('h'), number: numbers[k], date: today(), itemId: line.itemId, location, from, to: line.to,
            qty: tracked === 'serial' ? (line.serials ?? []).length : line.qty,
            reference: 'Status update', note: note || undefined,
            detail: tracked === 'serial' ? (line.serials ?? []).join(', ')
              : tracked === 'batch' ? (line.batches ?? []).map((b) => b.batch).join(', ') : undefined,
            parts: tracked === 'serial' ? (line.serials ?? []).map((ref) => ({ ref, qty: 1 }))
              : tracked === 'batch' ? (line.batches ?? []).map((b) => ({ ref: b.batch, qty: b.qty })) : undefined,
          };
        }),
        ...h,
        ];
      });
      return {};
    },

    receive: ({ bill, location, lines }) => {
      setLots((all) => [
        ...all,
        ...lines.flatMap((line) => (line.serials?.length
          ? line.serials.map((sn) => lot(line.itemId, location, line.statusId, 1, { serial: sn }))
          : [lot(line.itemId, location, line.statusId, line.qty, {
            batch: line.batch, manufactured: line.manufactured, expiry: line.expiry,
          })])),
      ]);
      setHistory((h) => {
        const numbers = nextNumbers(h, lines.length);
        return [
          ...lines.map((line, k) => ({
            id: uid('h'), number: numbers[k], date: today(), itemId: line.itemId, location, from: null, to: line.statusId,
            qty: line.serials?.length ?? line.qty, reference: bill,
            detail: line.batch ?? line.serials?.join(', '),
            parts: line.serials?.length ? line.serials.map((ref) => ({ ref, qty: 1 }))
              : line.batch ? [{ ref: line.batch, qty: line.qty }] : undefined,
          })),
          ...h,
        ];
      });
      setBillCount((n) => n + 1);
    },
  }), [statuses, lots, history, billCount]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useInventory(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useInventory outside InventoryProvider');
  return s;
}

/** The statuses a picker offers, with their descriptions as the second line. */
export const statusOptions = (statuses: InventoryStatus[], opts: { exclude?: string; includeInactive?: boolean } = {}) =>
  statuses
    .filter((s) => (opts.includeInactive || s.active) && s.id !== opts.exclude)
    .map((s) => ({ value: s.id, label: s.name, description: s.description }));

export const statusName = (statuses: InventoryStatus[], id: string | null) =>
  (id ? statuses.find((s) => s.id === id)?.name ?? id : 'New stock');

export const itemName = (id: string) => ITEMS.find((i) => i.id === id)?.name ?? id;
