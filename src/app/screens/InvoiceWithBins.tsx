import { useState } from 'react';
import {
  Banner, Button, CreatePage, FormRow, FormSection, Icon, InputField, PageHeader, ProductTable, Select, SplitButton, Stack,
} from '@canon';
import type { ProductColumn, ProductRow, TotalRow } from '@canon';
import { CUSTOMERS, ITEMS, WAREHOUSES, itemById, money, onHand, qty2 } from '../data/stock';
import { ItemDetailsPanel } from './ItemDetailsPanel';

/**
 * SALES → INVOICES → NEW INVOICE, with the Item Details panel open on the
 * line's item (the screenshot). Picking an item on a line opens its panel;
 * "Item Details" above the table reopens it for the last line touched.
 *
 * The panel's Transactions tab is where the feature lives: each invoice entry
 * has **View Bin and Batch details** under "Discount exclusive of tax", and the
 * current invoice's details are computed from this table — its quantity and
 * the Warehouse chosen above.
 */
export interface InvoiceWithBinsProps {
  onCancel: () => void;
  onSaved: (invoice: string) => void;
}

const INVOICE_NO = 'INV-000009';
const INVOICE_DATE = '09 Nov 2026';

const ITEM_OPTIONS = ITEMS.map((i) => ({
  value: i.id,
  label: i.name,
  description: `${i.sku} · ${i.tracking === 'batch' ? 'Batch tracked' : i.tracking === 'serial' ? 'Serial tracked' : 'Bins only'}`,
  media: <Icon name="items" size="md" tone="muted" />,
}));

const rid = () => `r-${Math.random().toString(36).slice(2, 8)}`;
const row = (item?: string): ProductRow => {
  const i = itemById(item);
  return { id: rid(), kind: 'item', values: i ? { item: i.id, qty: '1', rate: String(i.rate), discount: '0' } : { qty: '1', discount: '0' } };
};

export function InvoiceWithBins({ onCancel, onSaved }: InvoiceWithBinsProps) {
  const [customer, setCustomer] = useState('Shopify - Customer');
  const [orderNo, setOrderNo] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [warehouse, setWarehouse] = useState('Warehouse 1');
  const [initial] = useState<ProductRow[]>(() => [row('product-2'), row()]);
  const [rows, setRows] = useState<ProductRow[]>(initial);
  //  Opens on the first line, as in the screenshot.
  const [panelRow, setPanelRow] = useState<string | null>(initial[0].id);
  const [lastRow, setLastRow] = useState<string | null>(initial[0].id);
  const [error, setError] = useState<string | null>(null);

  const qtyOf = (r: ProductRow) => Number(r.values?.qty || 0);
  const amountOf = (r: ProductRow) => Math.max(0, qtyOf(r) * Number(r.values?.rate || 0) - Number(r.values?.discount || 0));

  const withDerived = (list: ProductRow[]) => list.map((r) => {
    const item = itemById(r.values?.item);
    const amount = item ? money.format(amountOf(r)) : '';
    const stock = item ? `${qty2(onHand(item, warehouse))} ${item.unit} · ${warehouse}` : '';
    if (r.values?.amount === amount && r.values?.stock === stock) return r;
    return { ...r, values: { ...r.values, amount, stock } };
  });

  const onRowsChange = (next: ProductRow[]) => {
    let picked: string | null = null;
    const filled = next.map((r) => {
      const before = rows.find((p) => p.id === r.id);
      const item = itemById(r.values?.item);
      if (item && before?.values?.item !== item.id) {
        picked = r.id;
        return { ...r, values: { ...r.values, rate: String(item.rate), qty: r.values?.qty || '1' } };
      }
      if (before && JSON.stringify(before.values) !== JSON.stringify(r.values)) setLastRow(r.id);
      return r;
    });
    setRows(withDerived(filled));
    setError(null);
    if (picked) { setPanelRow(picked); setLastRow(picked); }
  };

  const changeWarehouse = (w: string) => {
    setWarehouse(w);
    setRows((rs) => rs.map((r) => {
      const item = itemById(r.values?.item);
      return item ? { ...r, values: { ...r.values, stock: `${qty2(onHand(item, w))} ${item.unit} · ${w}` } } : r;
    }));
  };

  const columns: ProductColumn[] = [
    { id: 'item', label: 'Item Details', kind: 'select', width: 260, min: 180, options: ITEM_OPTIONS, placeholder: 'Type or click to select an item' },
    { id: 'qty', label: 'Quantity', kind: 'input', width: 100, min: 80, format: 'numeric', placeholder: '1.00' },
    { id: 'stock', label: 'Stock on Hand', kind: 'read-only', width: 170, min: 130, muted: true },
    { id: 'rate', label: 'Rate', kind: 'input', width: 100, min: 80, format: 'decimal', placeholder: '0.00' },
    { id: 'discount', label: 'Discount', kind: 'input', width: 100, min: 80, format: 'decimal', placeholder: '0.00' },
    { id: 'amount', label: 'Amount', kind: 'read-only', width: 120, min: 100, flex: true },
  ];

  const subTotal = rows.reduce((n, r) => n + (itemById(r.values?.item) ? amountOf(r) : 0), 0);
  const totals: TotalRow[] = [
    { id: 'sub', label: 'Sub Total', kind: 'static', amount: money.format(subTotal) },
    { id: 'total', label: 'Total ( $ )', kind: 'emphasis', amount: money.format(subTotal) },
  ];

  const save = () => {
    if (!rows.some((r) => itemById(r.values?.item))) { setError('Add at least one item to the invoice.'); return; }
    onSaved(INVOICE_NO);
  };

  const panel = rows.find((r) => r.id === panelRow);
  const panelItem = panel ? itemById(panel.values?.item) : undefined;
  const reopenId = rows.find((r) => r.id === lastRow && itemById(r.values?.item))?.id
    ?? rows.find((r) => itemById(r.values?.item))?.id;

  return (
    <>
      <PageHeader type="create" title="New Invoice" />

      <CreatePage
        reserveEndLane
        footer={(
          <>
            <Button emphasis="secondary" onClick={save}>Save as Draft</Button>
            <SplitButton emphasis="primary" onSelect={save}
              entries={[{ id: 'save-print', label: 'Save and Print', onSelect: save }]}>Save and Send</SplitButton>
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
                <FormRow label="Invoice Date" required>
                  {({ id, required }) => <InputField id={id} required={required} format="date" value="09/11/2026" onChange={() => {}} />}
                </FormRow>
                <FormRow label="Warehouse" required>
                  {({ id, required }) => (
                    <Select id={id} required={required} value={warehouse} onChange={changeWarehouse}
                      options={WAREHOUSES.map((w) => ({ value: w, label: w }))} />
                  )}
                </FormRow>
              </>
            )}
          >
            <FormRow label="Customer Name" required>
              {({ id, required }) => <Select id={id} required={required} options={CUSTOMERS} value={customer} onChange={setCustomer} />}
            </FormRow>
            <FormRow label="Invoice#" required>
              {({ id, required }) => <InputField id={id} required={required} value={INVOICE_NO} onChange={() => {}} />}
            </FormRow>
            <FormRow label="Order Number">
              {({ id }) => <InputField id={id} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />}
            </FormRow>
            <FormRow label="Salesperson">
              {({ id }) => (
                <Select id={id} value={salesperson} onChange={setSalesperson} placeholder="Select or Add Salesperson"
                  options={[{ value: 'priya', label: 'Priya Natarajan' }, { value: 'arun', label: 'Arun Kumar' }]} />
              )}
            </FormRow>
          </FormSection>

          <ProductTable
            title="Item Table"
            titleTrailing={reopenId ? (
              <Button emphasis="secondary" size="sm" icon="info" onClick={() => setPanelRow(reopenId)}>Item Details</Button>
            ) : null}
            columns={columns}
            rows={withDerived(rows)}
            onRowsChange={onRowsChange}
            onAddRow={() => setRows((r) => [...r, row()])}
            totals={totals}
          />
        </Stack>
      </CreatePage>

      {panel && panelItem ? (
        <ItemDetailsPanel
          open
          onClose={() => setPanelRow(null)}
          item={panelItem}
          line={{
            number: INVOICE_NO, date: INVOICE_DATE, customer, warehouse,
            qty: qtyOf(panel), price: Number(panel.values?.rate || 0), discount: Number(panel.values?.discount || 0),
          }}
        />
      ) : null}
    </>
  );
}
