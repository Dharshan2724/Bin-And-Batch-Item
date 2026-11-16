import { Fragment, useMemo, useRef, useState } from 'react';
import {
  Button, Divider, Icon, Inline, Menu, PageHeader, Stack, Surface, Table, Text,
} from '@canon';
import type { TableColumn } from '@canon';
import {
  LOCATIONS, STATS_PERIODS as PERIODS, changesIn, itemName, statusName, useInventory,
} from '../data/inventory';
import type { StatsFilter, StatusChange } from '../data/inventory';

/**
 * INVENTORY → INVENTORY STATUS. Step 2's landing page — the wireframe's
 * "Inventory Status Stats".
 *
 * Two things: how much stock MOVED INTO each status in a period (the tiles),
 * and every movement that did it (the table). A tile counts quantity, not
 * rows — "50 items reserved" is the fact a warehouse lead wants, not "three
 * updates happened".
 *
 * The period is a menu button rather than a select because it sits in the
 * card's own header line, like the wireframe's "THIS MONTH ▾", and a 34px form
 * field there reads as a form.
 *
 * Bills land here too, with `New stock` as their previous status — receiving
 * damaged goods straight into Damaged is a status movement as much as moving
 * them there later.
 */
const day = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export interface InventoryStatusStatsProps {
  /**
   * Owned by the app, not the page: a row opens a detail view whose mini list
   * IS this list, so the period and location have to survive the navigation.
   */
  filter: StatsFilter;
  onFilterChange: (next: StatsFilter) => void;
  onUpdate: () => void;
  onOpenItem: (itemId: string) => void;
  /** A row's record number — opens its detail view. */
  onOpenChange: (id: string) => void;
}

export function InventoryStatusStats({
  filter, onFilterChange, onUpdate, onOpenItem, onOpenChange,
}: InventoryStatusStatsProps) {
  const { statuses, history } = useInventory();
  const { period, location } = filter;
  const setPeriod = (p: StatsFilter['period']) => onFilterChange({ ...filter, period: p });
  const setLocation = (l: string) => onFilterChange({ ...filter, location: l });
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLButtonElement>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const locationRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(() => changesIn(history, filter), [history, filter]);

  const tiles = statuses.filter((s) => s.active).map((s) => ({
    status: s,
    qty: rows.filter((h) => h.to === s.id).reduce((n, h) => n + h.qty, 0),
  }));

  const moved = tiles.reduce((n, t) => n + t.qty, 0);

  const columns: TableColumn<StatusChange>[] = [
    { id: 'date', header: 'Date', cell: (h) => <Text as="span">{day.format(new Date(`${h.date}T00:00:00`))}</Text> },
    {
      //  THE IDENTIFYING COLUMN — `tone="link"`, and it opens the record.
      id: 'number', header: 'Status Update#',
      cell: (h) => (
        <Text as="a" href="#" tone="link" weight="medium"
          onClick={() => onOpenChange(h.id)}>
          {h.number}
        </Text>
      ),
    },
    {
      id: 'item', header: 'Item Name',
      cell: (h) => (
        <Text as="a" href="#" tone="link" onClick={() => onOpenItem(h.itemId)}>
          {itemName(h.itemId)}
        </Text>
      ),
    },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (h) => <Text as="span" weight="medium">{h.qty}</Text> },
    { id: 'location', header: 'Location', cell: (h) => <Text as="span" tone="secondary">{h.location}</Text> },
    {
      id: 'from', header: 'Previous Inventory Status',
      cell: (h) => <Text as="span" tone={h.from ? 'default' : 'tertiary'}>{statusName(statuses, h.from)}</Text>,
    },
    {
      id: 'to', header: 'Current Inventory Status',
      cell: (h) => <Text as="span" weight="medium">{statusName(statuses, h.to)}</Text>,
    },
    {
      id: 'ref', header: 'Reference',
      cell: (h) => (
        <Stack gap={0}>
          <Text as="span">{h.reference}</Text>
          {h.detail || h.note ? (
            <Text as="span" size="body-sm" tone="secondary" truncate>
              {[h.detail, h.note].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Stack>
      ),
    },
  ];

  const periodLabel = PERIODS.find((p) => p.id === period)?.label ?? '';

  return (
    <>
      <PageHeader
        type="create"
        title="Inventory Status Stats"
        cta={{ label: 'Update Status', icon: 'plus', onSelect: onUpdate }}
      />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-10">
          {/* The Payment Summary card: an overline title with the filters on
              its right, then the figures. */}
          <Surface tone="hover" pad={10} radius="card" border="default">
            <Stack gap={8}>
              <Inline gap={4} align="center" justify="between" wrap>
                <Text size="overline" tone="secondary">Inventory Status Summary</Text>
                <Inline gap={4} align="center">
                  <Button
                    ref={periodRef} emphasis="secondary" size="sm" iconRight="caret-down"
                    aria-haspopup="menu" aria-expanded={periodOpen}
                    onClick={() => setPeriodOpen((o) => !o)}
                  >
                    {periodLabel}
                  </Button>
                  <Button
                    ref={locationRef} emphasis="secondary" size="sm" iconRight="caret-down"
                    aria-haspopup="menu" aria-expanded={locationOpen}
                    onClick={() => setLocationOpen((o) => !o)}
                  >
                    {location === 'all' ? 'All Locations' : location}
                  </Button>
                </Inline>
              </Inline>

              {/* FOUR EQUAL COLUMNS in one white strip, a rule between each —
                  not four figures pushed to the edges by `between`, which left
                  ~300px of nothing between each pair. Every column carries the
                  same three lines, so the row reads as a table of one row. */}
              <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                <Inline gap={0} align="stretch">
                  {tiles.map(({ status, qty }, i) => (
                    <Fragment key={status.id}>
                      {i > 0 ? <Divider orientation="vertical" /> : null}
                      <Surface pad={8} grow>
                        <Inline gap={5} align="start">
                          <Surface tone={status.committable ? 'selected' : 'sunken'} radius="full" pad={3}>
                            <Icon name="inventory" size="lg" tone={status.committable ? 'primary' : 'muted'} />
                          </Surface>
                          <Stack gap={1}>
                            <Text size="body" tone="secondary">{status.name}</Text>
                            <Text size="subheading" weight="semibold">{`${qty} Items`}</Text>
                            <Text size="body-sm" tone="tertiary">
                              {moved ? `${Math.round((qty / moved) * 100)}% of stock moved` : 'No movement'}
                            </Text>
                          </Stack>
                        </Inline>
                      </Surface>
                    </Fragment>
                  ))}
                </Inline>
              </Surface>
            </Stack>
          </Surface>

          <Surface pad={0} radius="card" border="default" className="overflow-hidden">
            <Table
              caption={`Inventory status changes, ${periodLabel} — ${rows.length} records`}
              columns={columns}
              rows={rows}
              rowKey={(h) => h.id}
              placement="page"
              empty={<Text tone="secondary">No status changes in {periodLabel.toLowerCase()}.</Text>}
            />
          </Surface>
        </Stack>
      </Surface>

      <Menu
        anchor={periodRef.current}
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        label="Period"
        align="start"
        entries={PERIODS.map((p) => ({
          id: p.id, label: p.label, checked: p.id === period,
          onSelect: () => { setPeriod(p.id); setPeriodOpen(false); },
        }))}
      />
      <Menu
        anchor={locationRef.current}
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        label="Location"
        align="start"
        entries={[{ id: 'all', label: 'All Locations' }, ...LOCATIONS.map((l) => ({ id: l, label: l }))].map((l) => ({
          id: l.id, label: l.label, checked: l.id === location,
          onSelect: () => { setLocation(l.id); setLocationOpen(false); },
        }))}
      />
    </>
  );
}
