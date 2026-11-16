import { Divider, Inline, Stack, Surface, Text } from '@canon';
import { qty2 } from '../data/stock';
import type { Allocation, StockItem } from '../data/stock';

/**
 * The body of "View Inventory Details" — what one invoice line takes from
 * stock, GROUPED BY BIN: each bin and its total, then the batches (or serial
 * numbers) picked from that bin beneath it. A bin can hold several batches,
 * so the bin is the parent and the batch the child — the way a picker walks
 * the warehouse. Bins keep the pick order (earliest expiry first).
 */
export function BinBatchDetails({ item, allocation }: { item: StockItem; allocation: Allocation }) {
  const u = item.unit;
  if (!allocation.bins.length) {
    return <Text size="body-sm" tone="secondary">No stock is allocated to this line yet. Enter a quantity in the item table.</Text>;
  }

  const batchCount = allocation.batches.length;
  const serialCount = allocation.serials.length;
  const summary = [
    `${allocation.bins.length} bin${allocation.bins.length === 1 ? '' : 's'}`,
    item.tracking === 'batch' ? `${batchCount} batch${batchCount === 1 ? '' : 'es'}` : null,
    item.tracking === 'serial' ? `${serialCount} serial number${serialCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Stack gap={6}>
      <Text size="caption" tone="secondary">{summary}</Text>

      {allocation.bins.map((bin, i) => {
        const batches = allocation.batches.filter((b) => b.bin === bin.bin);
        const serials = allocation.serials.filter((s) => s.bin === bin.bin);
        return (
          <Stack key={bin.bin} gap={4}>
            {i > 0 ? <Divider /> : null}
            <Inline gap={6} justify="between" align="end">
              <Stack gap={0}>
                <Text size="overline" tone="secondary" weight="semibold">Bin</Text>
                <Text weight="semibold">{bin.bin}</Text>
              </Stack>
              <Text size="body-sm" weight="semibold">{qty2(bin.qty)} {u}</Text>
            </Inline>

            {batches.length ? (
              <Surface tone="sunken" radius="md" pad={5}>
                <Stack gap={4}>
                  {batches.map((b) => (
                    <Stack key={b.number} gap={1}>
                      <Inline gap={6} justify="between" align="baseline">
                        <Text size="body-sm" weight="medium">{b.number}</Text>
                        <Text size="body-sm">{qty2(b.take)} {u}</Text>
                      </Inline>
                      <Text size="caption" tone="secondary">Mfg {b.manufactured} · Exp {b.expiry}</Text>
                    </Stack>
                  ))}
                </Stack>
              </Surface>
            ) : null}

            {serials.length ? (
              <Surface tone="sunken" radius="md" pad={5}>
                <Stack gap={2}>
                  {serials.map((s) => (
                    <Text key={s.number} size="body-sm" weight="medium">{s.number}</Text>
                  ))}
                </Stack>
              </Surface>
            ) : null}
          </Stack>
        );
      })}

      {item.tracking === 'none' ? (
        <Text size="caption" tone="secondary">This item is not batch or serial tracked — only its bins apply.</Text>
      ) : null}

      {allocation.short > 0 ? (
        <Text size="body-sm" tone="danger">{qty2(allocation.short)} {u} more than is in stock at this warehouse — not allocated to any bin.</Text>
      ) : null}
    </Stack>
  );
}
