import { useMemo, useState } from 'react';
import {
  DetailsToolbar, Inline, MiniList, PageHeader, Segmented, Select, SplitView, Stack,
  StatusBadge, Surface, Table, Tabs, Text,
} from '@canon';
import type { DetailsToolbarGroup, MiniListItem, TableColumn } from '@canon';
import {
  ITEMS, LOCATIONS, statusName, statusOptions, stockByLocation, useInventory,
} from '../data/inventory';
import type { Lot, StatusChange, StockRow } from '../data/inventory';

/**
 * ITEMS → one item. Step 4 of the flow: the status breakdown on the item.
 *
 * Two of the wireframe's frames live here:
 *
 * · **Locations** — the stock table gains NOT AVAILABLE FOR SALE and
 *   AVAILABLE STOCK between Stock on Hand and Committed Stock (the two columns
 *   the frame outlines in red). Below it, the same stock split by every
 *   status, so "10 not available" can be read as "6 reserved, 4 damaged".
 * · **Batch Details / Serial Numbers** — a Status filter beside Location, so
 *   "which batches are damaged" is one choice instead of a scan.
 *
 * Untracked items have no batch tab; that frame only exists for tracked ones.
 * History is this item's status movements — the same rows as the Inventory
 * Status page, filtered to it.
 */
export interface ItemStockProps {
  itemId: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onUpdateStatus: (itemId: string) => void;
  /** A control the prototype does not cover — the caller says so. */
  onOutside: () => void;
}

const TRACKING_LABEL = { none: 'Inventory Item', serial: 'Serial Tracked Item', batch: 'Batch Tracked Item' } as const;
const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDate = (iso?: string) => (iso ? day.format(new Date(`${iso}T00:00:00`)) : '—');
const n2 = (n: number) => n.toFixed(2);

export function ItemStock({ itemId, onSelect, onBack, onUpdateStatus, onOutside }: ItemStockProps) {
  const { statuses, lots, history } = useInventory();
  const item = ITEMS.find((i) => i.id === itemId) ?? ITEMS[0];
  const [tab, setTab] = useState('locations');
  const [stockView, setStockView] = useState('accounting');
  const [lotLocation, setLotLocation] = useState('all');
  const [lotStatus, setLotStatus] = useState('all');

  const list: MiniListItem[] = useMemo(() => ITEMS.map((i) => {
    const onHand = lots.filter((l) => l.itemId === i.id).reduce((n, l) => n + l.qty, 0);
    return {
      id: i.id, name: i.name, amount: `₹${i.rate.toFixed(2)}`,
      meta: [`SKU: ${i.sku}`, `${onHand} ${i.unit} on hand`],
    };
  }), [lots]);

  const stock = stockByLocation(lots, statuses, item.id);
  const total: StockRow = stock.reduce((t, r) => ({
    ...t,
    onHand: t.onHand + r.onHand, notForSale: t.notForSale + r.notForSale, available: t.available + r.available,
    committed: t.committed + r.committed, forSale: t.forSale + r.forSale,
    byStatus: Object.fromEntries(statuses.map((s) => [s.id, (t.byStatus[s.id] ?? 0) + (r.byStatus[s.id] ?? 0)])),
  }), { location: 'Total', onHand: 0, notForSale: 0, available: 0, committed: 0, forSale: 0, byStatus: {} });

  const num = (get: (r: StockRow) => number, strong = false) => (r: StockRow) => (
    <Text as="span" weight={strong || r.location === 'Total' ? 'semibold' : 'regular'}>{n2(get(r))}</Text>
  );

  const stockColumns: TableColumn<StockRow>[] = [
    { id: 'loc', header: 'Location Name', cell: (r) => <Text as="span" weight={r.location === 'Total' ? 'semibold' : 'medium'}>{r.location}</Text> },
    { id: 'onHand', header: 'Stock on Hand', align: 'end', cell: num((r) => r.onHand) },
    { id: 'nfs', header: 'Not Available for Sale', align: 'end', cell: num((r) => r.notForSale) },
    { id: 'avail', header: 'Available Stock', align: 'end', cell: num((r) => r.available) },
    { id: 'committed', header: 'Committed Stock', align: 'end', cell: num((r) => r.committed) },
    { id: 'forSale', header: 'Available for Sale', align: 'end', cell: num((r) => r.forSale, true) },
  ];

  //  Every status a quantity could be in — inactive ones too, if stock is
  //  still sitting in them, or the row would not add up to Stock on Hand.
  const shownStatuses = statuses.filter((s) => s.active || (total.byStatus[s.id] ?? 0) > 0);
  const breakdownColumns: TableColumn<StockRow>[] = [
    { id: 'loc', header: 'Location Name', cell: (r) => <Text as="span" weight={r.location === 'Total' ? 'semibold' : 'medium'}>{r.location}</Text> },
    ...shownStatuses.map((s) => ({
      id: s.id, header: s.name, align: 'end' as const,
      cell: num((r: StockRow) => r.byStatus[s.id] ?? 0),
    })),
  ];

  const itemLots = lots
    .filter((l) => l.itemId === item.id)
    .filter((l) => (lotLocation === 'all' || l.location === lotLocation) && (lotStatus === 'all' || l.statusId === lotStatus))
    .sort((a, b) => (a.batch ?? a.serial ?? '').localeCompare(b.batch ?? b.serial ?? ''));

  const statusCell = (l: Lot) => {
    const s = statuses.find((x) => x.id === l.statusId);
    return s?.committable
      ? <StatusBadge status="success">{s.name}</StatusBadge>
      : <StatusBadge status="pending">{s?.name ?? l.statusId}</StatusBadge>;
  };

  const lotColumns: TableColumn<Lot>[] = item.tracking === 'serial' ? [
    { id: 'sn', header: 'Serial Number', cell: (l) => <Text as="span" tone="link" weight="medium">{l.serial}</Text> },
    { id: 'loc', header: 'Location', cell: (l) => <Text as="span">{l.location}</Text> },
    { id: 'status', header: 'Status', cell: statusCell },
  ] : [
    { id: 'batch', header: 'Batch', cell: (l) => <Text as="span" tone="link" weight="medium">{l.batch}</Text> },
    { id: 'mfg', header: 'Manufactured Date', cell: (l) => <Text as="span">{fmtDate(l.manufactured)}</Text> },
    { id: 'exp', header: 'Expiry Date', cell: (l) => <Text as="span">{fmtDate(l.expiry)}</Text> },
    { id: 'loc', header: 'Location', cell: (l) => <Text as="span">{l.location}</Text> },
    { id: 'status', header: 'Status', cell: statusCell },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (l) => <Text as="span" weight="medium">{n2(l.qty)}</Text> },
  ];

  const itemHistory = history.filter((h) => h.itemId === item.id).sort((a, b) => b.date.localeCompare(a.date));
  const historyColumns: TableColumn<StatusChange>[] = [
    { id: 'date', header: 'Date', cell: (h) => <Text as="span">{fmtDate(h.date)}</Text> },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (h) => <Text as="span" weight="medium">{h.qty}</Text> },
    { id: 'loc', header: 'Location', cell: (h) => <Text as="span" tone="secondary">{h.location}</Text> },
    { id: 'from', header: 'Previous Status', cell: (h) => <Text as="span" tone={h.from ? 'default' : 'tertiary'}>{statusName(statuses, h.from)}</Text> },
    { id: 'to', header: 'Current Status', cell: (h) => <Text as="span" weight="medium">{statusName(statuses, h.to)}</Text> },
    { id: 'ref', header: 'Reference', cell: (h) => <Text as="span">{[h.reference, h.detail].filter(Boolean).join(' · ')}</Text> },
  ];

  const tabs = [
    { id: 'locations', label: 'Locations' },
    ...(item.tracking === 'none' ? [] : [{ id: 'lots', label: item.tracking === 'serial' ? 'Serial Numbers' : 'Batch Details' }]),
    { id: 'history', label: 'Status History', badge: String(itemHistory.length) },
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'locations';

  const toolbar: DetailsToolbarGroup[] = [{
    id: 'item', label: 'Item actions',
    items: [
      { id: 'edit', label: 'Edit', icon: 'edit', onSelect: onOutside },
      { id: 'adjust', label: 'Adjust Stock', onSelect: onOutside },
      { id: 'status', label: 'Update Status', icon: 'refresh', onSelect: () => onUpdateStatus(item.id) },
    ],
  }];

  return (
    <SplitView
      list={(
        <MiniList
          label="Items"
          items={list}
          activeId={item.id}
          onActivate={onSelect}
          views={[{ id: 'all', label: 'All Items' }]}
          viewId="all"
          onViewChange={() => {}}
          onCreate={onOutside}
        />
      )}
    >
      <PageHeader type="detail" title={item.name} parent={{ label: 'All Items', href: '#' }} onBack={onBack} />
      <DetailsToolbar groups={toolbar} />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-10">
          <Surface pad={10} radius="card" border="default">
            <Inline gap={10} align="center" justify="between" wrap>
              <Stack gap={1}>
                <Text size="body-sm" tone="secondary">{TRACKING_LABEL[item.tracking]} · SKU: {item.sku}</Text>
                <Text size="body" tone="secondary">
                  Stock on Hand <Text as="span" weight="semibold" tone="default">{n2(total.onHand)}</Text>
                  {' · '}Not Available for Sale <Text as="span" weight="semibold" tone="default">{n2(total.notForSale)}</Text>
                  {' · '}Available for Sale <Text as="span" weight="semibold" tone="default">{n2(total.forSale)}</Text>
                </Text>
              </Stack>
            </Inline>
          </Surface>

          <Surface pad={0} radius="card" border="default" className="overflow-hidden">
            <Tabs
              label="Item sections"
              items={tabs}
              value={activeTab}
              onChange={setTab}
              trailing={activeTab === 'locations' ? (
                <Segmented
                  size="sm" label="Stock view" value={stockView} onChange={setStockView}
                  options={[{ value: 'accounting', label: 'Accounting Stock' }, { value: 'physical', label: 'Physical Stock' }]}
                />
              ) : undefined}
            >
              {activeTab === 'locations' ? (
                <Stack gap={10} className="px-15 py-10">
                  <Stack gap={4}>
                    <Text size="subheading" weight="semibold">Stock Locations</Text>
                    <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                      <Table
                        caption={`${item.name} — stock by location`}
                        columns={stockColumns} rows={[...stock, total]} rowKey={(r) => r.location}
                        placement="page"
                      />
                    </Surface>
                    <Text size="body-sm" tone="secondary">
                      Not Available for Sale is stock in a status that cannot be committed. Available for Sale is Available Stock less Committed Stock.
                    </Text>
                  </Stack>

                  <Stack gap={4}>
                    <Text size="subheading" weight="semibold">Stock by Inventory Status</Text>
                    <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                      <Table
                        caption={`${item.name} — stock by inventory status`}
                        columns={breakdownColumns} rows={[...stock, total]} rowKey={(r) => r.location}
                        placement="page"
                      />
                    </Surface>
                  </Stack>
                </Stack>
              ) : activeTab === 'lots' ? (
                <Stack gap={6} className="px-15 py-10">
                  <Inline gap={6} align="center" wrap>
                    <Inline gap={3} align="center">
                      <Text size="body-sm" tone="secondary">Location</Text>
                      <Select
                        ariaLabel="Filter by location" value={lotLocation} onChange={setLotLocation}
                        options={[{ value: 'all', label: 'All' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))]}
                      />
                    </Inline>
                    <Inline gap={3} align="center">
                      <Text size="body-sm" tone="secondary">Status</Text>
                      <Select
                        ariaLabel="Filter by inventory status" value={lotStatus} onChange={setLotStatus}
                        options={[{ value: 'all', label: 'All Statuses' }, ...statusOptions(statuses, { includeInactive: true })]}
                      />
                    </Inline>
                  </Inline>
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table
                      caption={`${item.name} — ${item.tracking === 'serial' ? 'serial numbers' : 'batches'}`}
                      columns={lotColumns} rows={itemLots} rowKey={(l) => l.id}
                      placement="page"
                      empty={<Text tone="secondary">No {item.tracking === 'serial' ? 'serial numbers' : 'batches'} match these filters.</Text>}
                    />
                  </Surface>
                </Stack>
              ) : (
                <Stack gap={6} className="px-15 py-10">
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table
                      caption={`${item.name} — status history`}
                      columns={historyColumns} rows={itemHistory} rowKey={(h) => h.id}
                      placement="page"
                      empty={<Text tone="secondary">No status changes for this item yet.</Text>}
                    />
                  </Surface>
                </Stack>
              )}
            </Tabs>
          </Surface>
        </Stack>
      </Surface>
    </SplitView>
  );
}
