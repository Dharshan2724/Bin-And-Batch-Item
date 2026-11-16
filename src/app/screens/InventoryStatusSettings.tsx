import { useState } from 'react';
import {
  PageHeader, StatusBadge, Surface, Table, Text,
} from '@canon';
import type { TableColumn } from '@canon';
import { useInventory } from '../data/inventory';
import type { InventoryStatus } from '../data/inventory';
import { StatusFormModal } from './StatusFormModal';

/**
 * SETTINGS → INVENTORY → INVENTORY STATUS. Step 1 of the flow: the list of
 * statuses an organisation has, and "+ New" to add one.
 *
 * The wireframe's three columns — name, description, status — plus one it
 * implies but does not draw: whether the status is available for commitment.
 * That flag is what decides which stock column a status's quantity lands in on
 * the item page, so a list that hides it hides the only consequential setting.
 *
 * The name is the identifying column, so it is the link (`Text tone="link"`)
 * and opens the same dialog in edit mode.
 */
export function InventoryStatusSettings() {
  const { statuses } = useInventory();
  const [editing, setEditing] = useState<InventoryStatus | null>(null);
  const [open, setOpen] = useState(false);

  const columns: TableColumn<InventoryStatus>[] = [
    {
      id: 'name', header: 'Inventory Status Name',
      cell: (s) => (
        <Text
          as="a" href="#" tone="link" weight="medium"
          onClick={() => { setEditing(s); setOpen(true); }}
        >
          {s.name}
        </Text>
      ),
    },
    {
      id: 'description', header: 'Description',
      cell: (s) => <Text as="span" tone="secondary" truncate title={s.description}>{s.description || '—'}</Text>,
    },
    {
      id: 'commit', header: 'Available for Commitment',
      cell: (s) => <Text as="span">{s.committable ? 'Yes' : 'No'}</Text>,
    },
    {
      id: 'status', header: 'Status',
      cell: (s) => (s.active
        ? <StatusBadge status="success">Active</StatusBadge>
        : <StatusBadge status="inactive">Inactive</StatusBadge>),
    },
  ];

  //  The settings look: the page is a white CARD on the `surface/sunken`
  //  ground, inset from the rail and the bar, rather than a full-bleed body.
  return (
    <>
      <Surface tone="sunken" pad={4} radius="none" className="flex flex-col flex-1 min-h-0">
        <Surface tone="default" pad={0} radius="card" border="default"
          className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <PageHeader
            type="create"
            title="Inventory Status"
            cta={{ label: 'New', icon: 'plus', onSelect: () => { setEditing(null); setOpen(true); } }}
          />
          <Table
            caption={`Inventory statuses — ${statuses.length} records`}
            columns={columns}
            rows={statuses}
            rowKey={(s) => s.id}
            placement="page"
            empty={<Text tone="secondary">No inventory statuses yet.</Text>}
          />
        </Surface>
      </Surface>

      <StatusFormModal open={open} status={editing} onClose={() => setOpen(false)} />
    </>
  );
}
