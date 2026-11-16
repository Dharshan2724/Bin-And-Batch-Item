import { useState } from 'react';
import {
  Checkbox, DescriptionList, Divider, Icon, Inline, SidePanel, Stack, Surface, Tabs, Text, Toggletip,
} from '@canon';
import { PAST_INVOICES, WAREHOUSES, allocate, money, onHand, qty2 } from '../data/stock';
import type { StockItem } from '../data/stock';
import { BinBatchDetails } from './BinBatchDetails';

/**
 * ITEM DETAILS — the right-hand panel an invoice line opens, as in the
 * screenshot. The Transactions tab lists the item's invoices, the current one
 * first; under each entry's "Discount exclusive of tax" sits
 * **View Bin and Batch details**, a Toggletip with the bins, batches and serial
 * numbers that invoice takes for this item.
 *
 * The current invoice's details come live from the item table — change the
 * quantity or the warehouse and the popover follows.
 */
export interface ItemDetailsPanelProps {
  open: boolean;
  onClose: () => void;
  item: StockItem;
  /** The current invoice's line for this item. */
  line: { number: string; date: string; customer: string; warehouse: string; qty: number; price: number; discount: number };
}

const TABS = [
  { id: 'details', label: 'Item Details' },
  { id: 'locations', label: 'Stock Locations' },
  { id: 'transactions', label: 'Transactions' },
];

export function ItemDetailsPanel({ open, onClose, item, line }: ItemDetailsPanelProps) {
  const [tab, setTab] = useState('transactions');
  const [onlyCustomer, setOnlyCustomer] = useState(true);

  const entries = [
    { ...line, status: 'DRAFT' as const, current: true },
    ...PAST_INVOICES
      .filter((p) => p.itemId === item.id && (!onlyCustomer || p.customer === line.customer))
      .map((p) => ({ ...p, current: false })),
  ];

  return (
    <SidePanel open={open} onClose={onClose} title="Item Details" modal={false}>
      <Stack gap={0}>
        <Surface tone="sunken" radius="none" pad={8}>
          <Inline gap={8} align="center">
            <Surface tone="default" radius="md" pad={6} border="default">
              <Icon name="items" size="xl" tone="muted" />
            </Surface>
            <Stack gap={1}>
              <Text size="body-sm" tone="secondary">Inventory Items</Text>
              <Text size="heading" weight="semibold">{item.name}</Text>
              <Text size="body-sm" tone="secondary">{item.unit} · {trackingLabel(item)}</Text>
            </Stack>
          </Inline>
        </Surface>

        <Tabs items={TABS} value={tab} onChange={setTab} label="Item details views">
          <Surface pad={8} radius="none">
            {tab === 'details' ? (
              <DescriptionList items={[
                { label: 'SKU', value: item.sku },
                { label: 'Unit', value: item.unit },
                { label: 'Tracking', value: trackingLabel(item) },
                { label: 'Selling Price', value: money.format(item.rate) },
              ]} />
            ) : null}

            {tab === 'locations' ? (
              <Stack gap={6}>
                {WAREHOUSES.map((w) => (
                  <Stack key={w} gap={3}>
                    <Inline justify="between" align="baseline">
                      <Text weight="semibold">{w}</Text>
                      <Text size="body-sm">{qty2(onHand(item, w))} {item.unit} on hand</Text>
                    </Inline>
                    {item.stock[w].bins.map((b) => (
                      <Inline key={b.bin} justify="between" align="baseline">
                        <Text size="body-sm" tone="secondary">Bin {b.bin}</Text>
                        <Text size="body-sm">{qty2(b.qty)} {item.unit}</Text>
                      </Inline>
                    ))}
                  </Stack>
                ))}
              </Stack>
            ) : null}

            {tab === 'transactions' ? (
              <Stack gap={6}>
                <Inline justify="between" align="center">
                  <Text size="title" weight="medium">Invoices</Text>
                  <Text size="body-sm" tone="secondary">Status: All</Text>
                </Inline>
                <Checkbox
                  label={`Show only ${line.customer}'s transactions`}
                  selection={onlyCustomer ? 'checked' : 'unchecked'}
                  onSelectionChange={(s) => setOnlyCustomer(s === 'checked')}
                />
                <Divider />
                {entries.map((e) => (
                  <Stack key={e.number} gap={4}>
                    <Stack gap={2}>
                      <Inline justify="between" align="baseline">
                        <Text weight="medium">{e.customer}</Text>
                        <Text size="body-sm" tone="secondary">Item Price <Text as="span" tone="default">{money.format(e.price)}</Text></Text>
                      </Inline>
                      <Inline justify="between" align="baseline">
                        <Text size="body-sm"><Text as="span" tone="link">{e.number}</Text> · {e.date}</Text>
                        <Text size="body-sm" tone="secondary">Quantity Sold <Text as="span" tone="default">{qty2(e.qty)}</Text></Text>
                      </Inline>
                      <Inline justify="between" align="baseline">
                        <Text size="caption" tone={e.status === 'PAID' ? 'success' : e.status === 'SENT' ? 'info' : 'secondary'}>
                          {e.status}{e.current ? ' · This invoice' : ''}
                        </Text>
                        <Text size="body-sm" tone="secondary">Discount exclusive of tax <Text as="span" tone="default">{money.format(e.discount)}</Text></Text>
                      </Inline>
                    </Stack>
                    <Inline justify="end">
                      <Toggletip
                        label="View Bin and Batch details"
                        title="Bin & Batch details"
                        subtitle={`${e.number} · ${item.name} · ${qty2(e.qty)} ${item.unit} · ${e.warehouse}`}
                      >
                        <BinBatchDetails item={item} allocation={allocate(item, e.warehouse, e.qty)} />
                      </Toggletip>
                    </Inline>
                    <Divider />
                  </Stack>
                ))}
              </Stack>
            ) : null}
          </Surface>
        </Tabs>
      </Stack>
    </SidePanel>
  );
}

const trackingLabel = (i: StockItem) =>
  i.tracking === 'batch' ? 'Batch tracked' : i.tracking === 'serial' ? 'Serial tracked' : 'Not tracked';
