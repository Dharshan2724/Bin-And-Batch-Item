import { Divider, Inline, Stack, Text } from '@canon';
import type { ReactNode } from 'react';
import { qty2 } from '../data/stock';
import type { Allocation, StockItem } from '../data/stock';

/**
 * The body of "View Bin and Batch details" — what one invoice line takes from
 * stock: the bins it is picked from, and the batches or serial numbers in them.
 * Only the sections the item's tracking has are drawn.
 */
export function BinBatchDetails({ item, allocation }: { item: StockItem; allocation: Allocation }) {
  const u = item.unit;
  if (!allocation.bins.length) {
    return <Text size="body-sm" tone="secondary">No stock is allocated to this line yet. Enter a quantity in the item table.</Text>;
  }
  return (
    <Stack gap={6}>
      <Section title="Bins">
        {allocation.bins.map((b) => (
          <Inline key={b.bin} gap={6} justify="between" align="baseline">
            <Text size="body-sm" weight="medium">{b.bin}</Text>
            <Text size="body-sm">{qty2(b.qty)} {u}</Text>
          </Inline>
        ))}
      </Section>

      {item.tracking === 'batch' ? (
        <>
          <Divider />
          <Section title="Batches">
            {allocation.batches.map((b) => (
              <Stack key={b.number} gap={1}>
                <Inline gap={6} justify="between" align="baseline">
                  <Text size="body-sm" weight="medium">{b.number}</Text>
                  <Text size="body-sm">{qty2(b.take)} {u}</Text>
                </Inline>
                <Text size="caption" tone="secondary">Bin {b.bin} · Mfg {b.manufactured} · Exp {b.expiry}</Text>
              </Stack>
            ))}
          </Section>
        </>
      ) : null}

      {item.tracking === 'serial' ? (
        <>
          <Divider />
          <Section title={`Serial Numbers (${allocation.serials.length})`}>
            {allocation.serials.map((s) => (
              <Inline key={s.number} gap={6} justify="between" align="baseline">
                <Text size="body-sm" weight="medium">{s.number}</Text>
                <Text size="caption" tone="secondary">Bin {s.bin}</Text>
              </Inline>
            ))}
          </Section>
        </>
      ) : null}

      {item.tracking === 'none' ? (
        <Text size="caption" tone="secondary">This item is not batch or serial tracked — only its bins apply.</Text>
      ) : null}

      {allocation.short > 0 ? (
        <Text size="body-sm" tone="danger">{qty2(allocation.short)} {u} more than is in stock at this warehouse — not allocated to any bin.</Text>
      ) : null}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={3}>
      <Text size="overline" tone="secondary" weight="semibold">{title}</Text>
      {children}
    </Stack>
  );
}
