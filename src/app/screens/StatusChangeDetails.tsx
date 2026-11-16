import { useMemo, useRef, useState } from 'react';
import {
  DescriptionList, DetailsToolbar, Icon, Inline, Menu, MiniList, PageHeader, SplitView, Stack,
  StatusBadge, Surface, Table, Tabs, Text,
} from '@canon';
import type {
  DetailsToolbarGroup, MenuEntry, MiniListItem, StatusBadgeStatus, TableColumn,
} from '@canon';
import {
  ITEMS, STATS_PERIODS, changesIn, itemName, partsOf, statusName, useInventory,
} from '../data/inventory';
import type { InventoryStatus, StatsFilter, StatusChange } from '../data/inventory';

/**
 * INVENTORY → INVENTORY STATUS → one status change. The detail view of a row on
 * the stats page, composed exactly as `Sales → Invoices → INV-4318` is.
 *
 * **The mini list is the stats page's list** — the same period and location,
 * in the same order — because that is where the user came from. Its view
 * switch is the period, so changing it here changes it there too.
 *
 * Section 1 is the movement at a glance: the item, how much, and the two
 * statuses with an arrow between them. Section 2 is the record — the fields,
 * the batches or serials that moved (tracked items only), and every other
 * movement of the same item.
 */
export interface StatusChangeDetailsProps {
  changeId: string;
  filter: StatsFilter;
  onFilterChange: (next: StatsFilter) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onOpenItem: (itemId: string) => void;
  onUpdateStatus: (itemId: string) => void;
  /** A control the prototype does not cover — the caller says so. */
  onOutside: () => void;
}

const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const fmt = (iso?: string) => (iso ? day.format(new Date(`${iso}T00:00:00`)) : '—');

/**
 * A status as a badge. Committable statuses are stock you can sell, so they
 * read as `success`; the rest are held back, `pending`. Arrived stock had no
 * status before, so its "from" is `inactive` — New stock.
 */
const badgeFor = (statuses: InventoryStatus[], id: string | null): StatusBadgeStatus => {
  if (!id) return 'inactive';
  return statuses.find((s) => s.id === id)?.committable ? 'success' : 'pending';
};

export function StatusChangeDetails({
  changeId, filter, onFilterChange, onSelect, onBack, onOpenItem, onUpdateStatus, onOutside,
}: StatusChangeDetailsProps) {
  const { statuses, lots, history } = useInventory();
  const [tab, setTab] = useState('details');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(() => changesIn(history, filter), [history, filter]);
  //  The record can be outside the list — reached from Item History with a
  //  narrower period. It still opens; the list simply has no active row.
  const change = history.find((h) => h.id === changeId) ?? rows[0] ?? history[0];
  const item = ITEMS.find((i) => i.id === change.itemId) ?? ITEMS[0];
  const tracked = item.tracking !== 'none';
  const lotsLabel = item.tracking === 'serial' ? 'Serial Numbers' : 'Batches';

  const list: MiniListItem[] = rows.map((h) => ({
    id: h.id,
    name: itemName(h.itemId),
    amount: `${h.qty} ${ITEMS.find((i) => i.id === h.itemId)?.unit ?? ''}`,
    meta: [h.number, fmt(h.date), h.location],
    status: statusName(statuses, h.to),
    statusVariant: badgeFor(statuses, h.to),
  }));

  //  Per batch, the dates come from the lot that holds it — any status, any
  //  location: a batch's dates do not change when its status does.
  const parts = partsOf(change).map((p) => {
    const lot = lots.find((l) => l.itemId === item.id && (l.batch === p.ref || l.serial === p.ref));
    return { ...p, manufactured: lot?.manufactured, expiry: lot?.expiry };
  });
  type Part = (typeof parts)[number];
  const partColumns: TableColumn<Part>[] = item.tracking === 'serial' ? [
    { id: 'ref', header: 'Serial Number', cell: (p) => <Text as="span" weight="medium">{p.ref}</Text> },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (p) => <Text as="span">{p.qty}</Text> },
  ] : [
    { id: 'ref', header: 'Batch Reference#', cell: (p) => <Text as="span" weight="medium">{p.ref}</Text> },
    { id: 'mfg', header: 'Manufactured Date', cell: (p) => <Text as="span">{fmt(p.manufactured)}</Text> },
    { id: 'exp', header: 'Expiry Date', cell: (p) => <Text as="span">{fmt(p.expiry)}</Text> },
    { id: 'qty', header: 'Quantity Moved', align: 'end', cell: (p) => <Text as="span" weight="medium">{p.qty}</Text> },
  ];

  const itemHistory = history
    .filter((h) => h.itemId === item.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const historyColumns: TableColumn<StatusChange>[] = [
    { id: 'date', header: 'Date', cell: (h) => <Text as="span">{fmt(h.date)}</Text> },
    {
      id: 'number', header: 'Status Update#',
      //  The record being read is not a link to itself.
      cell: (h) => (h.id === change.id
        ? <Text as="span" weight="medium">{h.number}</Text>
        : <Text as="a" href="#" tone="link" weight="medium" onClick={() => onSelect(h.id)}>{h.number}</Text>),
    },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (h) => <Text as="span" weight="medium">{h.qty}</Text> },
    { id: 'loc', header: 'Location', cell: (h) => <Text as="span" tone="secondary">{h.location}</Text> },
    { id: 'from', header: 'Previous Status', cell: (h) => <Text as="span" tone={h.from ? 'default' : 'tertiary'}>{statusName(statuses, h.from)}</Text> },
    { id: 'to', header: 'Current Status', cell: (h) => <Text as="span" weight="medium">{statusName(statuses, h.to)}</Text> },
  ];

  const tabs = [
    { id: 'details', label: 'Status Details' },
    ...(tracked ? [{ id: 'lots', label: lotsLabel, badge: String(parts.length) }] : []),
    { id: 'history', label: 'Item History', badge: String(itemHistory.length) },
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'details';

  const fromBill = change.from === null;
  const toolbar: DetailsToolbarGroup[] = [{
    id: 'record', label: 'Status update actions',
    items: [
      //  Edit is always first and never carries a caret.
      { id: 'edit', label: 'Edit', icon: 'edit', onSelect: onOutside },
      { id: 'update', label: 'Update Status', icon: 'refresh', onSelect: () => onUpdateStatus(item.id) },
      { id: 'item', label: 'View Item', icon: 'items', onSelect: () => onOpenItem(item.id) },
      { id: 'print', label: 'PDF/Print', icon: 'pdf', menu: true, onSelect: onOutside },
    ],
  }];
  const more: MenuEntry[] = [
    { id: 'clone', label: 'Clone', icon: 'clone', onSelect: () => { setMoreOpen(false); onOutside(); } },
    { id: 'export', label: 'Export', icon: 'export', onSelect: () => { setMoreOpen(false); onOutside(); } },
    { separator: true },
    { id: 'delete', label: 'Delete', icon: 'delete', tone: 'danger', onSelect: () => { setMoreOpen(false); onOutside(); } },
  ];

  return (
    <SplitView
      list={(
        <MiniList
          label="Inventory status changes"
          items={list}
          activeId={list.some((r) => r.id === change.id) ? change.id : null}
          onActivate={onSelect}
          views={STATS_PERIODS.map((p) => ({ id: p.id, label: p.label }))}
          viewId={filter.period}
          onViewChange={(id) => onFilterChange({ ...filter, period: id as StatsFilter['period'] })}
          onCreate={() => onUpdateStatus('')}
        />
      )}
    >
      <PageHeader
        type="detail"
        title={change.number}
        parent={{ label: 'Inventory Status Stats', href: '#' }}
        onBack={onBack}
      />
      <DetailsToolbar
        groups={toolbar}
        overflow={{ ref: moreRef, expanded: moreOpen, onSelect: () => setMoreOpen((o) => !o) }}
      />
      <Menu
        anchor={moreRef.current}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        label="More actions for this status update"
        align="start"
        emphasis="strong"
        entries={more}
      />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-10">
          {/* SECTION 1 — the movement at a glance. */}
          <Surface pad={10} radius="card" border="default">
            <Inline gap={8} align="center" wrap>
              <Surface tone="selected" radius="full" pad={4}>
                <Icon name="inventory" size="lg" tone="primary" />
              </Surface>
              <Stack gap={2} className="min-w-0 flex-1">
                <Text size="heading" truncate>{item.name}</Text>
                <Text size="body-sm" tone="secondary">
                  {`SKU: ${item.sku} · ${change.location} · ${fmt(change.date)}`}
                </Text>
              </Stack>
              {/* From → to. Two badges and an arrow, because the record IS the
                  transition; one badge would say where the stock is, not that
                  it moved. */}
              <Inline gap={4} align="center" className="flex-none">
                <StatusBadge status={badgeFor(statuses, change.from)}>
                  {statusName(statuses, change.from)}
                </StatusBadge>
                <Icon name="arrow-right" size="sm" tone="muted" label="moved to" />
                <StatusBadge status={badgeFor(statuses, change.to)}>
                  {statusName(statuses, change.to)}
                </StatusBadge>
              </Inline>
              <Stack gap={2} align="end" className="flex-none">
                <Text size="title" weight="semibold" className="tabular-nums">{`${change.qty} ${item.unit}`}</Text>
                <Text size="body-sm" tone="secondary">Quantity moved</Text>
              </Stack>
            </Inline>
          </Surface>

          {/* SECTION 2 — tabbed. `pad={0}` + `overflow-hidden`, or the strip's
              rule stops short of the card's edges. */}
          <Surface pad={0} radius="card" border="default" className="overflow-hidden">
            <Tabs label="Status update views" items={tabs} value={activeTab} onChange={setTab}>
              {activeTab === 'details' ? (
                <Stack gap={8} className="p-15">
                  <Inline gap={16} align="start" wrap>
                    <DescriptionList className="flex-1 min-w-0" items={[
                      { label: 'Status Update#', value: change.number },
                      { label: 'Date', value: fmt(change.date) },
                      { label: 'Location', value: change.location },
                      { label: 'Reference', value: change.reference },
                      ...(change.note ? [{ label: 'Reason', value: change.note }] : []),
                    ]} />
                    <DescriptionList className="flex-1 min-w-0" items={[
                      {
                        label: 'Item',
                        value: <Text as="a" href="#" tone="link" onClick={() => onOpenItem(item.id)}>{item.name}</Text>,
                      },
                      { label: 'Quantity', value: `${change.qty} ${item.unit}` },
                      {
                        label: 'Previous Status',
                        value: <Text as="span" tone={change.from ? 'default' : 'tertiary'}>{statusName(statuses, change.from)}</Text>,
                      },
                      { label: 'Current Status', value: statusName(statuses, change.to) },
                      ...(tracked ? [{ label: lotsLabel, value: parts.map((p) => p.ref).join(', ') || '—' }] : []),
                    ]} />
                  </Inline>
                  <Text size="body-sm" tone="secondary">
                    {fromBill
                      ? `Received on ${change.reference} straight into ${statusName(statuses, change.to)}. Stock on Hand went up by ${change.qty} ${item.unit}.`
                      : `A status change does not alter Stock on Hand — it moved ${change.qty} ${item.unit} between statuses at ${change.location}.`}
                  </Text>
                </Stack>
              ) : activeTab === 'lots' ? (
                <Stack gap={6} className="px-15 py-10">
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table
                      caption={`${change.number} — ${lotsLabel.toLowerCase()} moved`}
                      columns={partColumns} rows={parts} rowKey={(p) => p.ref}
                      placement="page"
                      empty={<Text tone="secondary">No {lotsLabel.toLowerCase()} were recorded for this change.</Text>}
                    />
                  </Surface>
                </Stack>
              ) : (
                <Stack gap={6} className="px-15 py-10">
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table
                      caption={`${item.name} — every status change`}
                      columns={historyColumns} rows={itemHistory} rowKey={(h) => h.id}
                      placement="page"
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
