import { useEffect, useState } from 'react';
import {
  Checkbox, FormRow, InputField, Modal, Stack, Textarea, Toggle,
} from '@canon';
import { useInventory } from '../data/inventory';
import type { InventoryStatus } from '../data/inventory';

/**
 * CREATE / EDIT INVENTORY STATUS — the wireframe's "Create New Inventory
 * Status" dialog.
 *
 * One component, opened from two places: Settings → Inventory Status, and the
 * "+ New Inventory Status" link inside the bill's serial and batch dialogs.
 * The second is why it hands the saved status back — a status created
 * mid-bill should be the one the line is now in, not one the user then has to
 * go and find in the list.
 *
 * "Available for Commitment" is the one decision a status carries. Ticked, its
 * stock counts as Available Stock and can be committed to a sales order;
 * unticked, it lands in Not Available for Sale. The checkbox's description
 * says that, because the wireframe's `?` hint is the only place it is said.
 */
export interface StatusFormModalProps {
  open: boolean;
  /** Edit this status; omit to create one. */
  status?: InventoryStatus | null;
  onClose: () => void;
  onSaved?: (status: InventoryStatus) => void;
}

export function StatusFormModal({ open, status, onClose, onSaved }: StatusFormModalProps) {
  const { statuses, saveStatus } = useInventory();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [committable, setCommittable] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | undefined>();

  //  Reset on every open, so a cancelled draft does not come back the next time.
  useEffect(() => {
    if (!open) return;
    setName(status?.name ?? '');
    setDescription(status?.description ?? '');
    setCommittable(status?.committable ?? false);
    setActive(status?.active ?? true);
    setError(undefined);
  }, [open, status]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter a name for the status.'); return; }
    const clash = statuses.some((s) => s.id !== status?.id && s.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) { setError(`"${trimmed}" already exists.`); return; }
    const saved = saveStatus({
      id: status?.id, name: trimmed, description: description.trim(),
      committable, active, system: status?.system,
    });
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={status ? 'Edit Inventory Status' : 'Create New Inventory Status'}
      width="lg"
      onRequestClose={onClose}
      primaryAction={{ label: 'Save', onSelect: save }}
      secondaryAction={{ label: 'Cancel', onSelect: onClose }}
    >
      <Stack gap={8}>
        <FormRow label="Status Name" required error={error} span="full">
          {({ id, required, describedBy }) => (
            <InputField
              id={id} value={name} required={required} aria-required={required || undefined}
              aria-describedby={describedBy} error={Boolean(error)} autoFocus
              placeholder="e.g. Quality Check"
              onChange={(e) => { setName(e.target.value); setError(undefined); }}
            />
          )}
        </FormRow>
        <FormRow label="Description" span="full">
          {({ id }) => (
            <Textarea
              id={id} rows={3} value={description}
              placeholder="What this status means for the stock in it"
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </FormRow>
        <Checkbox
          selection={committable ? 'checked' : 'unchecked'}
          onSelectionChange={(next) => setCommittable(next === 'checked')}
          label="Available for Commitment"
          description="Stock in this status counts as Available Stock and can be committed to sales orders. Leave unticked to show it under Not Available for Sale."
          disabled={status?.system}
        />
        {status ? (
          <Toggle
            checked={active}
            onCheckedChange={setActive}
            label={status.system ? 'Active — the default status cannot be turned off' : 'Active'}
            disabled={status.system}
          />
        ) : null}
      </Stack>
    </Modal>
  );
}
