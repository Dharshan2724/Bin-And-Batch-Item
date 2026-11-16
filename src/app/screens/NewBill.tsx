import { useState } from 'react';
import {
  Banner, Button, CreatePage, FormRow, FormSection, InputField, Inline, Modal, PageHeader,
  ProductTable, Select, Stack, Surface, Text, Textarea,
} from '@canon';
import type { ProductColumn, ProductRow, TotalRow } from '@canon';
import {
  ITEMS, LOCATIONS, statusName, statusOptions, useInventory,
} from '../data/inventory';
import type { InventoryStatus, Item, ReceiveLine } from '../data/inventory';
import { StatusFormModal } from './StatusFormModal';

/**
 * PURCHASES → BILLS → NEW BILL. Step 3 of the flow: incoming stock gets its
 * status the moment it is received, instead of landing in Available Stock and
 * being moved later.
 *
 * The wireframe has three cases, and they are the three tracking modes:
 *
 * · **Untracked** ("for non-inventory items") — the line itself carries the
 *   status, as the Inventory Status column. Defaults to Available Stock.
 * · **Serial tracked** — the Add Serial Numbers dialog: one status for the
 *   serials typed or scanned on that line.
 * · **Batch tracked** — the batch dialog, where every batch gets its OWN
 *   status ("Associate Status"), because one delivery can hold a good batch
 *   and a damaged one.
 *
 * Choosing a tracked item opens its dialog straight away, the way the product
 * asks for serials today; the "Serial & batch details" card under the table
 * reopens it. The line's own status cell still works on a tracked line and
 * applies to every serial or batch on it.
 *
 * Both dialogs carry "+ New Inventory Status", so a status nobody has set up
 * yet does not send the user to Settings mid-bill.
 */
export interface NewBillProps {
  onCancel: () => void;
  onSaved: (bill: string) => void;
}

const VENDORS = [
  { value: 'konark', label: 'Konark Ceramics' },
  { value: 'meridian', label: 'Meridian Home Goods' },
  { value: 'kaveri', label: 'Kaveri Appliances' },
];

const ACCOUNTS = [
  { value: 'inventory', label: 'Inventory Asset' },
  { value: 'cogs', label: 'Cost of Goods Sold' },
  { value: 'finished', label: 'Finished Goods' },
];

const ITEM_OPTIONS = ITEMS.map((i) => ({
  value: i.id,
  label: i.name,
  description: i.tracking === 'none' ? i.sku : `${i.sku} · ${i.tracking === 'serial' ? 'Serial' : 'Batch'} tracked`,
}));

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

interface Tracked {
  statusId: string;
  serials: string;
  batches: ProductRow[];
}

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const newRow = (): ProductRow => ({ id: rid('r'), kind: 'item', values: { account: 'inventory', status: 'available' } });
const splitSerials = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

export function NewBill({ onCancel, onSaved }: NewBillProps) {
  const { statuses, billCount, receive } = useInventory();
  const [vendor, setVendor] = useState('konark');
  const [billNo, setBillNo] = useState(`BL-${String(billCount + 1).padStart(5, '0')}`);
  const [orderNo, setOrderNo] = useState('');
  const [billDate, setBillDate] = useState('03/11/2026');
  const [location, setLocation] = useState('Head Office');
  const [rows, setRows] = useState<ProductRow[]>([newRow()]);
  const [tracked, setTracked] = useState<Record<string, Tracked>>({});
  const [dialogRow, setDialogRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemOf = (r: ProductRow) => ITEMS.find((i) => i.id === r.values?.item);
  const qtyOf = (r: ProductRow) => Number(r.values?.qty || 0);

  const withAmounts = (list: ProductRow[]) => list.map((r) => {
    const amount = r.values?.item ? money.format(qtyOf(r) * Number(r.values?.rate || 0)) : '';
    return r.values?.amount === amount ? r : { ...r, values: { ...r.values, amount } };
  });

  const onRowsChange = (next: ProductRow[]) => {
    let open: string | null = null;
    const filled = next.map((r) => {
      const before = rows.find((p) => p.id === r.id);
      const item = itemOf(r);
      //  A new item on this line: take its rate, and if it is tracked, ask for
      //  its serials or batches now.
      if (item && before?.values?.item !== item.id) {
        if (item.tracking !== 'none') open = r.id;
        return { ...r, values: { ...r.values, rate: String(item.rate), qty: r.values?.qty || '1' } };
      }
      //  The line's status changed on a tracked line: it applies to all of it.
      if (item && item.tracking !== 'none' && before?.values?.status !== r.values?.status && r.values?.status) {
        const status = r.values.status;
        setTracked((t) => {
          const cur = t[r.id];
          if (!cur) return t;
          return {
            ...t,
            [r.id]: {
              ...cur, statusId: status,
              batches: cur.batches.map((b) => ({ ...b, values: { ...b.values, status } })),
            },
          };
        });
      }
      return r;
    });
    setRows(withAmounts(filled));
    setError(null);
    if (open) setDialogRow(open);
  };

  const columns: ProductColumn[] = [
    { id: 'item', label: 'Item Details', kind: 'select', width: 240, min: 160, options: ITEM_OPTIONS, placeholder: 'Type or click to select an item' },
    { id: 'account', label: 'Account', kind: 'select', width: 170, min: 120, options: ACCOUNTS, placeholder: 'Select an account' },
    { id: 'qty', label: 'Quantity', kind: 'input', width: 100, min: 80, format: 'numeric', placeholder: '1.00' },
    { id: 'rate', label: 'Rate', kind: 'input', width: 110, min: 80, format: 'decimal', placeholder: '0.00' },
    { id: 'status', label: 'Inventory Status', kind: 'select', width: 200, min: 150, options: statusOptions(statuses), placeholder: 'Set per batch' },
    { id: 'amount', label: 'Amount', kind: 'read-only', width: 130, min: 100, flex: true },
  ];

  const subTotal = rows.reduce((n, r) => n + qtyOf(r) * Number(r.values?.rate || 0), 0);
  const totals: TotalRow[] = [
    { id: 'sub', label: 'Sub Total', kind: 'static', amount: money.format(subTotal) },
    { id: 'total', label: 'Total (₹)', kind: 'emphasis', amount: money.format(subTotal) },
  ];

  const trackedRows = rows.filter((r) => itemOf(r)?.tracking && itemOf(r)?.tracking !== 'none');

  const summary = (r: ProductRow) => {
    const item = itemOf(r);
    const t = tracked[r.id];
    if (!item || !t) return 'Not added yet';
    if (item.tracking === 'serial') {
      const n = splitSerials(t.serials).length;
      return `${n} of ${qtyOf(r)} serials · ${statusName(statuses, t.statusId)}`;
    }
    const added = t.batches.reduce((n, b) => n + Number(b.values?.qty || 0), 0);
    const names = [...new Set(t.batches.map((b) => statusName(statuses, b.values?.status ?? '')))].join(', ');
    return `${t.batches.length} batch${t.batches.length === 1 ? '' : 'es'} · ${added} of ${qtyOf(r)} · ${names}`;
  };

  const save = () => {
    if (!vendor) { setError('Choose a vendor.'); return; }
    const lines = rows.filter((r) => itemOf(r));
    if (!lines.length) { setError('Add at least one item to the bill.'); return; }
    const out: ReceiveLine[] = [];
    for (const r of lines) {
      const item = itemOf(r) as Item;
      const qty = qtyOf(r);
      if (!(qty > 0)) { setError(`Enter a quantity for ${item.name}.`); return; }
      const t = tracked[r.id];
      if (item.tracking === 'none') {
        out.push({ itemId: item.id, qty, statusId: r.values?.status || 'available' });
      } else if (item.tracking === 'serial') {
        const sns = t ? splitSerials(t.serials) : [];
        if (sns.length !== qty) { setError(`${item.name} needs ${qty} serial numbers — ${sns.length} added.`); return; }
        out.push({ itemId: item.id, qty, statusId: t.statusId, serials: sns });
      } else {
        const bs = (t?.batches ?? []).filter((b) => b.values?.batch);
        const added = bs.reduce((n, b) => n + Number(b.values?.qty || 0), 0);
        if (added !== qty) { setError(`${item.name} needs batches totalling ${qty} — ${added} added.`); return; }
        for (const b of bs) {
          out.push({
            itemId: item.id, qty: Number(b.values?.qty), statusId: b.values?.status || 'available',
            batch: b.values?.batch, manufactured: b.values?.mfg, expiry: b.values?.expiry,
          });
        }
      }
    }
    receive({ bill: billNo, location, lines: out });
    onSaved(billNo);
  };

  const dialog = rows.find((r) => r.id === dialogRow);
  const dialogItem = dialog ? itemOf(dialog) : undefined;

  const applyTracked = (rowId: string, next: Tracked) => {
    setTracked((t) => ({ ...t, [rowId]: next }));
    //  Mirror the line's status cell: one status if there is one, blank if the
    //  batches are mixed, which shows the column's "Set per batch".
    const ids = new Set(next.batches.length ? next.batches.map((b) => b.values?.status) : [next.statusId]);
    const status = ids.size === 1 ? [...ids][0] ?? '' : '';
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, status } } : r)));
    setDialogRow(null);
  };

  return (
    <>
      <PageHeader type="create" title="New Bill" />

      <CreatePage
        reserveEndLane
        footer={(
          <>
            <Button onClick={save}>Save as Open</Button>
            <Button emphasis="secondary" onClick={save}>Save as Draft</Button>
            <Button emphasis="secondary" onClick={onCancel}>Cancel</Button>
          </>
        )}
      >
        <Stack gap={0}>
          {error ? <Banner tone="danger" onDismiss={() => setError(null)}>{error}</Banner> : null}

          <FormSection
            dividerGap="tight"
            trailing={(
              <>
                <FormRow label="Bill Date" required>
                  {({ id, required }) => (
                    <InputField id={id} required={required} format="date" value={billDate}
                      onChange={(e) => setBillDate(e.target.value)} placeholder="DD/MM/YYYY" />
                  )}
                </FormRow>
                <FormRow label="Warehouse Location" required>
                  {({ id, required }) => (
                    <Select id={id} required={required} value={location} onChange={setLocation}
                      options={LOCATIONS.map((l) => ({ value: l, label: l }))} />
                  )}
                </FormRow>
              </>
            )}
          >
            <FormRow label="Vendor Name" required>
              {({ id, required }) => (
                <Select id={id} required={required} options={VENDORS} value={vendor} onChange={setVendor}
                  placeholder="Select a vendor" />
              )}
            </FormRow>
            <FormRow label="Bill#" required>
              {({ id, required }) => (
                <InputField id={id} required={required} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
              )}
            </FormRow>
            <FormRow label="Order Number">
              {({ id }) => (
                <InputField id={id} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="PO-00012" />
              )}
            </FormRow>
          </FormSection>

          <Stack gap={8}>
            <ProductTable
              title="Item Table"
              columns={columns}
              rows={rows}
              onRowsChange={onRowsChange}
              onAddRow={() => setRows((r) => [...r, newRow()])}
              totals={totals}
            />

            {trackedRows.length ? (
              <Surface pad={8} radius="card" border="default">
                <Stack gap={6}>
                  <Text size="subheading" weight="semibold">Serial &amp; batch details</Text>
                  {trackedRows.map((r) => {
                    const item = itemOf(r) as Item;
                    return (
                      <Inline key={r.id} gap={6} align="center" justify="between">
                        <Stack gap={1}>
                          <Text weight="medium">{item.name}</Text>
                          <Text size="body-sm" tone="secondary">{summary(r)}</Text>
                        </Stack>
                        <Button emphasis="secondary" size="sm" onClick={() => setDialogRow(r.id)}>
                          {item.tracking === 'serial' ? 'Add Serial Numbers' : 'Add Batches'}
                        </Button>
                      </Inline>
                    );
                  })}
                </Stack>
              </Surface>
            ) : null}
          </Stack>
        </Stack>
      </CreatePage>

      {dialog && dialogItem?.tracking === 'serial' ? (
        <SerialsDialog
          item={dialogItem} qty={qtyOf(dialog)} location={location}
          value={tracked[dialog.id] ?? { statusId: dialog.values?.status || 'available', serials: '', batches: [] }}
          onCancel={() => setDialogRow(null)}
          onSave={(next) => applyTracked(dialog.id, next)}
        />
      ) : null}
      {dialog && dialogItem?.tracking === 'batch' ? (
        <BatchesDialog
          item={dialogItem} qty={qtyOf(dialog)} location={location}
          value={tracked[dialog.id] ?? {
            statusId: dialog.values?.status || 'available', serials: '',
            batches: [{ id: rid('b'), kind: 'item', values: { status: dialog.values?.status || 'available', qty: String(qtyOf(dialog) || '') } }],
          }}
          onCancel={() => setDialogRow(null)}
          onSave={(next) => applyTracked(dialog.id, next)}
        />
      ) : null}
    </>
  );
}

/* ── The two tracking dialogs ─────────────────────────────────────────────── */

interface DialogProps {
  item: Item;
  qty: number;
  location: string;
  value: Tracked;
  onCancel: () => void;
  onSave: (next: Tracked) => void;
}

/** The header both dialogs share: where it is going, what it is, how many. */
function DialogContext({ item, location, right }: { item: Item; location: string; right: string }) {
  return (
    <Surface tone="sunken" radius="md" pad={6}>
      <Inline gap={6} align="center" justify="between">
        <Stack gap={1}>
          <Text weight="medium">{item.name}</Text>
          <Text size="body-sm" tone="secondary">SKU: {item.sku} · Location: {location}</Text>
        </Stack>
        <Text size="body-sm" tone="secondary">{right}</Text>
      </Inline>
    </Surface>
  );
}

function SerialsDialog({ item, qty, location, value, onCancel, onSave }: DialogProps) {
  const { statuses } = useInventory();
  const [statusId, setStatusId] = useState(value.statusId);
  const [serials, setSerials] = useState(value.serials);
  const [creating, setCreating] = useState(false);
  const count = splitSerials(serials).length;

  return (
    <>
      <Modal
        open
        title="Add Serial Numbers"
        width="lg"
        onRequestClose={onCancel}
        primaryAction={{ label: 'Save', onSelect: () => onSave({ ...value, statusId, serials }) }}
        secondaryAction={{ label: 'Cancel', onSelect: onCancel }}
      >
        <Stack gap={8}>
          <DialogContext item={item} location={location} right={`Quantity: ${qty} ${item.unit}`} />
          <FormRow label="Inventory Status" required span="full">
            {({ id, required }) => (
              <Select id={id} required={required} value={statusId} onChange={setStatusId}
                options={statusOptions(statuses)} placeholder="Select a status" />
            )}
          </FormRow>
          <Inline>
            <Button emphasis="secondary" size="sm" icon="plus" onClick={() => setCreating(true)}>
              New Inventory Status
            </Button>
          </Inline>
          <FormRow label="Serial Numbers" required span="full">
            {({ id, required }) => (
              <Textarea id={id} required={required} rows={4} value={serials}
                onChange={(e) => setSerials(e.target.value)}
                placeholder="Type (comma separated) or scan the serial numbers" />
            )}
          </FormRow>
          <Text size="body-sm" tone={count === qty ? 'success' : 'secondary'}>
            Added Serial Qty: {count} of {qty}
          </Text>
        </Stack>
      </Modal>
      <StatusFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(s: InventoryStatus) => setStatusId(s.id)}
      />
    </>
  );
}

function BatchesDialog({ item, qty, location, value, onCancel, onSave }: DialogProps) {
  const { statuses } = useInventory();
  const [batches, setBatches] = useState<ProductRow[]>(value.batches);
  const [creating, setCreating] = useState(false);
  const added = batches.reduce((n, b) => n + Number(b.values?.qty || 0), 0);

  const columns: ProductColumn[] = [
    { id: 'batch', label: 'Batch Reference#', kind: 'input', width: 150, min: 110, placeholder: 'B-1024' },
    { id: 'mfg', label: 'Manufactured Date', kind: 'input', width: 140, min: 110, format: 'date', placeholder: 'DD/MM/YYYY' },
    { id: 'expiry', label: 'Expiry Date', kind: 'input', width: 130, min: 110, format: 'date', placeholder: 'DD/MM/YYYY' },
    { id: 'qty', label: 'Quantity In', kind: 'input', width: 100, min: 80, format: 'numeric', placeholder: '0' },
    { id: 'status', label: 'Associate Status', kind: 'select', width: 210, min: 160, flex: true, options: statusOptions(statuses), placeholder: 'Select a status' },
  ];

  return (
    <>
      <Modal
        open
        title="Add Batches"
        width="xl"
        onRequestClose={onCancel}
        primaryAction={{ label: 'Save', onSelect: () => onSave({ ...value, batches }) }}
        secondaryAction={{ label: 'Cancel', onSelect: onCancel }}
      >
        <Stack gap={8}>
          <DialogContext
            item={item} location={location}
            right={`Total Quantity: ${qty} ${item.unit} · Added: ${added} ${item.unit}`}
          />
          <ProductTable
            columns={columns}
            rows={batches}
            onRowsChange={setBatches}
            onAddRow={() => setBatches((b) => [...b, { id: rid('b'), kind: 'item', values: { status: 'available' } }])}
          />
          <Inline>
            <Button emphasis="secondary" size="sm" icon="plus" onClick={() => setCreating(true)}>
              New Inventory Status
            </Button>
          </Inline>
        </Stack>
      </Modal>
      <StatusFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
