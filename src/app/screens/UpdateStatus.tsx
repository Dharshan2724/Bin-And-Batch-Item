import { useEffect, useMemo, useState } from 'react';
import {
  Banner, Button, Checkbox, CreatePage, FormRow, FormSection, InputField, Modal, PageHeader,
  Inline, PickList, ProductTable, Select, Stack, Surface, Text, Textarea,
} from '@canon';
import type { ProductCellAction, ProductColumn, ProductRow } from '@canon';
import {
  CATEGORIES, ITEMS, LOCATIONS, batchesIn, categoryScope, qtyIn, serialsIn, statusName, statusOptions,
  useInventory,
} from '../data/inventory';
import type { Item } from '../data/inventory';

/**
 * INVENTORY → INVENTORY STATUS → UPDATE STATUS. Step 2 of the flow: move stock
 * that is already on hand from one status to another.
 *
 * The wireframe's three fields — location, the status the stock is in now, a
 * description — and its "Select Items" table. The table is a `ProductTable`
 * because the user AUTHORS these rows; the canon's rule is that every
 * line-item grid is that one component.
 *
 * Two columns are added to the wireframe's three, both read from the store:
 *
 * · **In {status}** — how much of the item is in the from-status at this
 *   location, so the user can see the ceiling before typing a quantity. It
 *   recomputes when the location or the from-status changes.
 * · **Quantity** — the wireframe implies it (the stats table has one) but the
 *   form does not draw it. A tracked line carries a link at the end of this
 *   cell — "Select Batches" / "Select Serials" — that opens a picker of what is
 *   actually in the from-status here. Nothing is typed: a batch that is not
 *   there cannot be named. The link turns into a tick once the picks add up to
 *   the quantity.
 *
 * Save refuses the whole update if any line cannot be moved, and says which.
 * A half-applied status change is worse than a refused one.
 */
export interface UpdateStatusProps {
  /** Start with this item already on a row — "Update Status" from an item. */
  itemId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

const ITEM_OPTIONS = ITEMS.map((i) => ({
  value: i.id,
  label: i.name,
  description: i.tracking === 'none' ? i.sku : `${i.sku} · ${i.tracking === 'serial' ? 'Serial' : 'Batch'} tracked`,
}));

const emptyRow = (itemId = '', qty?: string): ProductRow => ({
  id: `r-${Math.random().toString(36).slice(2, 8)}`, kind: 'item',
  values: qty ? { item: itemId, qty } : { item: itemId },
});

const money = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 });

/** What was picked for one line. Keyed to the item, so changing a row's item drops it. */
interface Pick {
  itemId: string;
  batches?: { batch: string; qty: number }[];
  serials?: string[];
}

const rid = () => Math.random().toString(36).slice(2, 8);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function UpdateStatus({ itemId, onCancel, onSaved }: UpdateStatusProps) {
  const { statuses, lots, moveStock } = useInventory();
  const [location, setLocation] = useState('Head Office');
  const [from, setFrom] = useState('available');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([emptyRow(itemId)]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  //  Add Items in Bulk: the picks in pick order, a quantity per pick, and the
  //  catalogue's own search and category filter.
  const [bulkPick, setBulkPick] = useState<string[]>([]);
  const [bulkQty, setBulkQty] = useState<Record<string, string>>({});
  const [bulkQuery, setBulkQuery] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkSubs, setBulkSubs] = useState(true);
  //  Batches and serials picked per row, and the row whose picker is open.
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);

  //  The read-only "In {status}" cell follows the item, the location and the
  //  from-status. Kept in the row values because that is what the table reads.
  const withAvailable = (list: ProductRow[]) => list.map((r) => {
    const id = r.values?.item ?? '';
    const have = id ? qtyIn(lots, id, location, from) : null;
    const unit = ITEMS.find((i) => i.id === id)?.unit ?? '';
    const available = have === null ? '' : `${have} ${unit}`;
    return r.values?.available === available ? r : { ...r, values: { ...r.values, available } };
  });

  useEffect(() => { setRows((r) => withAvailable(r)); }, [location, from, lots]);
  //  Picks are batches and serials IN the from-status AT the location — change
  //  either and they no longer name stock that is there.
  useEffect(() => { setPicks({}); }, [location, from]);

  const pickOf = (r: ProductRow) => {
    const p = picks[r.id];
    return p && p.itemId === r.values?.item ? p : undefined;
  };

  //  The Quantity cell's link. Attention until the picks add up to the
  //  quantity, done once they do — and the label says by how much they do not.
  const qtyAction = (r: ProductRow): ProductCellAction | null => {
    const item = ITEMS.find((i) => i.id === r.values?.item);
    if (!item || item.tracking === 'none') return null;
    const onSelect = () => setPickFor(r.id);
    const qty = Number(r.values?.qty) || 0;
    const p = pickOf(r);
    if (item.tracking === 'batch') {
      const b = p?.batches ?? [];
      const sum = b.reduce((n, x) => n + x.qty, 0);
      if (!b.length) return { label: 'Select Batches', tone: 'attention', onSelect };
      if (sum !== qty) return { label: `${sum} of ${qty} ${item.unit}`, tone: 'attention', onSelect };
      return { label: plural(b.length, 'batch', 'batches'), tone: 'done', onSelect };
    }
    const n = p?.serials?.length ?? 0;
    if (!n) return { label: 'Select Serials', tone: 'attention', onSelect };
    if (n !== qty) return { label: `${n} of ${qty} serials`, tone: 'attention', onSelect };
    return { label: plural(n, 'serial', 'serials'), tone: 'done', onSelect };
  };

  const fromName = statusName(statuses, from);

  //  "Copy to all" takes the FIRST line's status — literally the first, not the
  //  first one filled in — and writes it into every line. Disabled until that
  //  line has one, so the link never copies an empty value over real ones.
  const firstTo = rows.find((r) => r.kind === 'item')?.values?.to ?? '';
  const copyToAll = () => {
    if (!firstTo) return;
    setRows((rs) => rs.map((r) => (r.kind === 'item' ? { ...r, values: { ...r.values, to: firstTo } } : r)));
    setErrors({});
  };

  const columns: ProductColumn[] = useMemo(() => [
    { id: 'item', label: 'Items', kind: 'select', width: 260, min: 160, options: ITEM_OPTIONS, placeholder: 'Type or click to select an item' },
    { id: 'available', label: `In ${fromName}`, kind: 'read-only', width: 140, min: 100, muted: true },
    { id: 'qty', label: 'Quantity', kind: 'input', width: 230, min: 180, format: 'numeric', placeholder: '0', cellAction: qtyAction },
    { id: 'to', label: 'Current Updated Status*', kind: 'select', width: 240, min: 160, flex: true, options: statusOptions(statuses, { exclude: from }), placeholder: 'Select a status',
      headerAction: { label: 'Copy to all', onSelect: copyToAll, disabled: !firstTo } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statuses, from, fromName, firstTo, picks]);

  const pickRow = rows.find((r) => r.id === pickFor);
  const pickItem = ITEMS.find((i) => i.id === pickRow?.values?.item);
  //  A picker saved on a line with no quantity yet fills it in from the picks.
  const savePick = (rowId: string, p: Pick, total: number) => {
    setPicks((all) => ({ ...all, [rowId]: p }));
    setRows((rs) => rs.map((r) => (r.id === rowId && !(Number(r.values?.qty) > 0)
      ? { ...r, values: { ...r.values, qty: String(total) } } : r)));
    setErrors({});
    setPickFor(null);
  };

  const save = () => {
    if (!location || !from) { setFormError('Choose the location and the status the stock is in now.'); return; }
    const filled = rows.filter((r) => r.kind === 'item' && r.values?.item);
    if (!filled.length) { setFormError('Add at least one item to update.'); return; }
    const result = moveStock({
      location, from, note,
      lines: filled.map((r) => ({
        itemId: r.values?.item ?? '',
        qty: Number(r.values?.qty ?? 0),
        to: r.values?.to ?? '',
        batches: pickOf(r)?.batches,
        serials: pickOf(r)?.serials,
      })),
    });
    if (Object.keys(result).length) {
      setErrors(result);
      setFormError('Nothing was updated. Fix the lines below and save again.');
      return;
    }
    onSaved();
  };

  //  EVERY item is offered, each showing what it has in the from-status here —
  //  an item with none stays visible rather than vanishing, so the user can
  //  see why it cannot be moved. Save still refuses a line that has too little.
  const scope = bulkCategory ? categoryScope(bulkCategory, bulkSubs) : null;
  const q = bulkQuery.trim().toLowerCase();
  const bulkOptions = ITEMS
    .filter((i) => !scope || scope.has(i.category))
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
    .map((i) => {
      const have = qtyIn(lots, i.id, location, from);
      return {
        id: i.id,
        label: i.name,
        meta: `SKU: ${i.sku}  Rate: Rs.${money.format(i.rate)}`,
        aside: { label: `In ${fromName}`, value: `${money.format(have)} ${i.unit}`, positive: have > 0 },
      };
    });
  const bulkTotal = bulkPick.reduce((n, id) => n + (Number(bulkQty[id]) || 0), 0);
  const openBulk = () => {
    setBulkPick([]); setBulkQty({}); setBulkQuery(''); setBulkCategory(''); setBulkSubs(true);
    setBulkOpen(true);
  };

  const errorLines = Object.entries(errors).map(([i, msg]) => {
    const r = rows.filter((x) => x.kind === 'item' && x.values?.item)[Number(i)];
    const name = ITEMS.find((x) => x.id === r?.values?.item)?.name ?? `Line ${Number(i) + 1}`;
    return `${name}: ${msg}`;
  });

  return (
    <>
      <PageHeader type="create" title="Update Status" />

      <CreatePage
        reserveEndLane
        footer={(
          <>
            <Button onClick={save}>Save</Button>
            <Button emphasis="secondary" onClick={onCancel}>Cancel</Button>
          </>
        )}
      >
        <Stack gap={0}>
          {formError ? (
            <Stack gap={2}>
              <Banner tone="danger" onDismiss={() => { setFormError(null); setErrors({}); }}>{formError}</Banner>
              {errorLines.map((l) => <Text key={l} size="body-sm" tone="danger">{l}</Text>)}
            </Stack>
          ) : null}

          <FormSection dividerGap="tight">
            <FormRow label="Select Location" required>
              {({ id, required }) => (
                <Select id={id} required={required} options={LOCATIONS.map((l) => ({ value: l, label: l }))}
                  value={location} onChange={setLocation} placeholder="Select a location" />
              )}
            </FormRow>
            <FormRow label="Status before update" required>
              {({ id, required }) => (
                <Select id={id} required={required} options={statusOptions(statuses)}
                  value={from} onChange={setFrom} placeholder="Select a status" />
              )}
            </FormRow>
            <FormRow label="Description">
              {({ id }) => (
                <Textarea id={id} rows={4} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Why the stock is changing status" />
              )}
            </FormRow>
          </FormSection>

          <ProductTable
            title="Select Items"
            titleTrailing={(
              <Button emphasis="secondary" size="sm" onClick={openBulk}>
                Add Items in Bulk
              </Button>
            )}
            columns={columns}
            rows={rows}
            onRowsChange={(next) => { setRows(withAvailable(next)); setErrors({}); }}
            onAddRow={() => setRows((r) => withAvailable([...r, emptyRow()]))}
          />
        </Stack>
      </CreatePage>

      {pickRow && pickItem?.tracking === 'batch' ? (
        <BatchPicker
          item={pickItem} qty={Number(pickRow.values?.qty) || 0}
          location={location} from={from} fromName={fromName}
          value={pickOf(pickRow)?.batches ?? []}
          onCancel={() => setPickFor(null)}
          onSave={(batches) => savePick(pickRow.id, { itemId: pickItem.id, batches },
            batches.reduce((n, b) => n + b.qty, 0))}
        />
      ) : null}
      {pickRow && pickItem?.tracking === 'serial' ? (
        <SerialPicker
          item={pickItem} qty={Number(pickRow.values?.qty) || 0}
          location={location} from={from} fromName={fromName}
          value={pickOf(pickRow)?.serials ?? []}
          onCancel={() => setPickFor(null)}
          onSave={(serials) => savePick(pickRow.id, { itemId: pickItem.id, serials }, serials.length)}
        />
      ) : null}

      <Modal
        open={bulkOpen}
        title="Add Items in Bulk"
        width="xl"
        flush
        onRequestClose={() => setBulkOpen(false)}
      >
        <PickList
          label="Items"
          options={bulkOptions}
          selected={bulkPick}
          onSelectedChange={(next) => {
            //  A fresh pick starts at 1 — a picked line with no quantity would
            //  only fail on save.
            setBulkQty((qq) => Object.fromEntries(next.map((id) => [id, qq[id] ?? '1'])));
            setBulkPick(next);
          }}
          query={bulkQuery}
          onQueryChange={setBulkQuery}
          searchPlaceholder="Type to search by item name or SKU"
          filters={(
            <Stack gap={4}>
              <Select
                aria-label="Category"
                placeholder="All categories"
                value={bulkCategory}
                onChange={setBulkCategory}
                options={[{ value: '', label: 'All categories' },
                  ...CATEGORIES.map((c) => ({ value: c.id, label: c.parent ? `— ${c.label}` : c.label }))]}
              />
              <Checkbox
                label="Include sub-categories"
                selection={bulkSubs ? 'checked' : 'unchecked'}
                onSelectionChange={(n) => setBulkSubs(n === 'checked')}
                disabled={!bulkCategory}
              />
            </Stack>
          )}
          emptyOptions="No items match this search or category."
          summary={`Total Quantity: ${bulkTotal}`}
          renderSelected={(id) => {
            const item = ITEMS.find((i) => i.id === id)!;
            return {
              label: item.name,
              meta: `${qtyIn(lots, id, location, from)} ${item.unit} in ${fromName}`,
              control: (
                <InputField
                  aria-label={`Quantity of ${item.name}`}
                  format="decimal"
                  value={bulkQty[id] ?? ''}
                  onChange={(e) => setBulkQty((qq) => ({ ...qq, [id]: e.target.value }))}
                />
              ),
            };
          }}
          primaryAction={{
            label: 'Add Items',
            disabled: !bulkPick.length,
            onSelect: () => {
              //  A pick already on a row adds its quantity there rather than
              //  making a second line for the same item.
              setRows((r) => {
                const kept = r.filter((x) => x.values?.item).map((x) => {
                  const id = x.values?.item ?? '';
                  if (!bulkPick.includes(id)) return x;
                  const sum = (Number(x.values?.qty) || 0) + (Number(bulkQty[id]) || 0);
                  return { ...x, values: { ...x.values, qty: String(sum) } };
                });
                const added = bulkPick
                  .filter((id) => !r.some((x) => x.values?.item === id))
                  .map((id) => emptyRow(id, bulkQty[id]));
                return withAvailable([...kept, ...added]);
              });
              setBulkOpen(false);
            },
          }}
          secondaryAction={{ label: 'Cancel', onSelect: () => setBulkOpen(false) }}
        />
      </Modal>
    </>
  );
}

/* ── The pickers ─────────────────────────────────────────────────────────── */

interface PickerProps<T> {
  item: Item;
  /** The line's quantity — 0 when not typed yet. */
  qty: number;
  location: string;
  from: string;
  fromName: string;
  value: T[];
  onCancel: () => void;
  onSave: (next: T[]) => void;
}

/** Which item, where, from what — and on the right, how the picks stand. */
function PickerContext({ item, location, fromName, right }: { item: Item; location: string; fromName: string; right: string }) {
  return (
    <Surface tone="sunken" radius="md" pad={6}>
      <Inline gap={6} align="center" justify="between">
        <Stack gap={1}>
          <Text weight="medium">{item.name}</Text>
          <Text size="body-sm" tone="secondary">Location: {location} · Status before update: {fromName}</Text>
        </Stack>
        <Text size="body-sm" tone="secondary">{right}</Text>
      </Inline>
    </Surface>
  );
}

/**
 * SELECT BATCHES — a batch and a quantity per row, as many rows as batches.
 * Every option is a batch that is in the from-status here, with what it holds,
 * so the only thing that can still go wrong is asking a batch for too much —
 * which is checked here, by name, before Save.
 */
function BatchPicker({ item, qty, location, from, fromName, value, onCancel, onSave }: PickerProps<{ batch: string; qty: number }>) {
  const { lots } = useInventory();
  const available = batchesIn(lots, item.id, location, from);
  const blank = (): ProductRow => ({ id: rid(), kind: 'item', values: {} });
  const [rows, setRows] = useState<ProductRow[]>(value.length
    ? value.map((b) => ({ id: rid(), kind: 'item', values: { batch: b.batch, qty: String(b.qty) } }))
    : [blank()]);

  //  One entry per batch — the same batch on two rows is one pick of the sum.
  const merged = new Map<string, number>();
  for (const r of rows) {
    const b = r.values?.batch;
    if (b) merged.set(b, (merged.get(b) ?? 0) + (Number(r.values?.qty) || 0));
  }
  const picked = [...merged].map(([batch, n]) => ({ batch, qty: n })).filter((b) => b.qty > 0);
  const sum = picked.reduce((n, b) => n + b.qty, 0);
  const over = picked.flatMap((b) => {
    const have = available.find((a) => a.batch === b.batch)?.qty ?? 0;
    return b.qty > have ? [`Batch ${b.batch} has only ${have} ${item.unit} in ${fromName} here.`] : [];
  });

  const columns: ProductColumn[] = [
    {
      id: 'batch', label: 'Batch Reference#*', kind: 'select', width: 380, min: 200, flex: true,
      placeholder: 'Select Batch',
      options: available.map((b) => ({
        value: b.batch as string,
        label: b.batch as string,
        description: `${b.qty} ${item.unit} in ${fromName}${b.expiry ? ` · Expires ${b.expiry}` : ''}`,
      })),
    },
    { id: 'qty', label: 'Quantity Out*', kind: 'input', width: 160, min: 100, format: 'numeric', placeholder: '0' },
  ];

  const right = qty > 0
    ? `Total Quantity: ${qty} ${item.unit} · Quantity to be added: ${Math.max(qty - sum, 0)} ${item.unit}`
    : `Selected: ${sum} ${item.unit}`;

  return (
    <Modal
      open
      title="Select Batches"
      width="lg"
      reserveEndLane
      onRequestClose={onCancel}
      primaryAction={{ label: 'Save', disabled: !picked.length || over.length > 0, onSelect: () => onSave(picked) }}
      secondaryAction={{ label: 'Cancel', onSelect: onCancel }}
    >
      <Stack gap={8}>
        <PickerContext item={item} location={location} fromName={fromName} right={right} />
        {available.length ? (
          <ProductTable
            columns={columns}
            rows={rows}
            onRowsChange={setRows}
            onAddRow={() => setRows((r) => [...r, blank()])}
            emptyText="No batches added yet."
          />
        ) : (
          <Banner tone="info">No batches of {item.name} are in {fromName} at {location}.</Banner>
        )}
        <Stack gap={2}>
          <Text size="body-sm" tone="secondary">Batches added: {picked.length} of {available.length}</Text>
          {qty > 0 && sum > qty ? (
            <Text size="body-sm" tone="danger">{sum - qty} {item.unit} more than the line's quantity of {qty}.</Text>
          ) : null}
          {over.map((m) => <Text key={m} size="body-sm" tone="danger">{m}</Text>)}
        </Stack>
      </Stack>
    </Modal>
  );
}

/**
 * SELECT SERIAL NUMBERS — the serials picked so far, and a searchable field
 * that adds one at a time. Only serials in the from-status here are offered,
 * and a picked one leaves the list, so a serial cannot be added twice.
 */
function SerialPicker({ item, qty, location, from, fromName, value, onCancel, onSave }: PickerProps<string>) {
  const { lots } = useInventory();
  const inStatus = serialsIn(lots, item.id, location, from);
  const [rows, setRows] = useState<ProductRow[]>(
    value.map((sn) => ({ id: rid(), kind: 'item', values: { serial: sn } })),
  );
  const picked = rows.map((r) => r.values?.serial ?? '').filter(Boolean);
  const remaining = inStatus.filter((sn) => !picked.includes(sn));

  const columns: ProductColumn[] = [
    { id: 'serial', label: 'Serial Numbers', kind: 'read-only', width: 400, min: 200, flex: true },
  ];

  const right = qty > 0
    ? `Quantity: ${qty} ${item.unit} · Selected: ${picked.length}`
    : `Selected: ${picked.length}`;

  return (
    <Modal
      open
      title="Select Serial Numbers"
      width="lg"
      reserveEndLane
      onRequestClose={onCancel}
      primaryAction={{ label: 'Save', disabled: !picked.length, onSelect: () => onSave(picked) }}
      secondaryAction={{ label: 'Cancel', onSelect: onCancel }}
    >
      <Stack gap={8}>
        <PickerContext item={item} location={location} fromName={fromName} right={right} />
        <ProductTable
          columns={columns}
          rows={rows}
          onRowsChange={setRows}
          emptyText="No serial number has been added."
        />
        {inStatus.length ? (
          <Select
            searchable
            value=""
            //  The field never holds a value — each pick is ADDED and it goes back
            //  to empty. So '' (Escape restoring what it opened with) adds nothing.
            onChange={(sn) => { if (sn) setRows((r) => [...r, { id: rid(), kind: 'item', values: { serial: sn } }]); }}
            options={remaining.map((sn) => ({ value: sn, label: sn }))}
            placeholder={remaining.length ? 'Click or type to select' : 'Every serial number is selected'}
            disabled={!remaining.length}
            searchPlaceholder="Search serial numbers"
            emptyText="No serial numbers match."
            ariaLabel="Add a serial number"
          />
        ) : (
          <Banner tone="info">No serial numbers of {item.name} are in {fromName} at {location}.</Banner>
        )}
        {qty > 0 && picked.length > qty ? (
          <Text size="body-sm" tone="danger">{picked.length - qty} more than the line's quantity of {qty}.</Text>
        ) : null}
      </Stack>
    </Modal>
  );
}
