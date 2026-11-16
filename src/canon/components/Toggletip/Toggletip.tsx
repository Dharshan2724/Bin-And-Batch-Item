import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../icons';
import type { IconName } from '../../icons';
import { Text } from '../../primitives';
import { cn } from '../../utils/cn';

/**
 * TOGGLETIP — a tooltip you click. A text-link trigger and a small, anchored,
 * NON-MODAL dialog of read-only detail: an invoice line's bins, batches and
 * serial numbers, a figure's breakdown, the rule behind a number.
 *
 * ── WHY NOT ONE OF THE THREE THAT EXIST ─────────────────────────────────────
 * · **Tooltip (hover)** — hover content cannot hold a table the user reads,
 *   scrolls or copies from, and touch has no hover at all. WCAG 1.4.13 also
 *   wants hover content dismissable and persistent, which is a toggletip.
 * · **Menu** — a list of COMMANDS with a roving focus model. This holds content,
 *   not actions; the arrow-key model would trap the reader inside a table.
 * · **Modal / SidePanel** — both take the page away. The answer here is a
 *   glance: the user reads it and carries on, with the form still live behind.
 *
 * ── THE TRIGGER ─────────────────────────────────────────────────────────────
 * Drawn as a link (`text/link`, `primary/text`, 5.92:1) but it is a <button>:
 * it opens something on this page, it does not navigate. `aria-expanded` and
 * `aria-controls` say what it does to a screen reader.
 *
 * ── THE PANEL ───────────────────────────────────────────────────────────────
 * `role="dialog"`, NOT `aria-modal`: no focus trap, no inert page. Focus moves
 * to the panel on open so it is announced, Esc and the close glyph return focus
 * to the trigger, and a pointerdown anywhere else closes it. It shares the
 * menu's paint (`surface/default`, `radius/lg`, `shadow/menu`) so two floating
 * panels never drift apart, and it places itself the way Menu does: below the
 * trigger, flipped above when there is no room, clamped 4px inside the viewport.
 */
export interface ToggletipProps {
  /** The trigger's text — "View Bin and Batch details". */
  label: string;
  /** The panel's heading. Also its accessible name. */
  title: string;
  /** A line under the title — what the detail belongs to. */
  subtitle?: string;
  /** The panel body. Read-only content; keep commands out of it. */
  children: ReactNode;
  /** Optional leading glyph on the trigger. */
  icon?: IconName;
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end';
  /** Controlled open state. Omit both to let the component own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const GAP = 4;

export function Toggletip({
  label, title, subtitle, children, icon, align = 'end',
  open: openProp, onOpenChange, className,
}: ToggletipProps) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = useCallback((next: boolean) => {
    if (openProp === undefined) setOwn(next);
    onOpenChange?.(next);
  }, [openProp, onOpenChange]);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelId = useId();
  const titleId = useId();

  //  Rendered at −9999 first, measured, then placed — the position cannot be
  //  known until the panel exists to be measured. Same as Menu.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const p = panel.current;
      if (!t || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const below = t.bottom + GAP;
      const flip = below + h > window.innerHeight && t.top - GAP - h > 0;
      const wanted = align === 'start' ? t.left : t.right - w;
      setPos({
        top: flip ? t.top - GAP - h : below,
        left: Math.min(Math.max(GAP, wanted), Math.max(GAP, window.innerWidth - w - GAP)),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align]);

  //  Focus follows the panel in once it has a position, so it is announced.
  useEffect(() => {
    if (open && pos) panel.current?.focus({ preventScroll: true });
  }, [open, pos]);

  //  Click-outside. `pointerdown`, so a press on another control closes this
  //  before that control acts, and the trigger is excluded so its own click
  //  can toggle rather than close-then-reopen.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (panel.current?.contains(n) || trigger.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, setOpen]);

  const close = () => { setOpen(false); trigger.current?.focus(); };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-2 p-0 m-0 border-0 bg-transparent cursor-pointer',
          'text-body-sm font-medium text-primary-text hover:underline',
          'rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          className,
        )}
      >
        {icon ? <Icon name={icon} size="sm" tone="inherit" /> : null}
        {label}
      </button>

      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
          style={pos ?? { top: -9999, left: -9999 }}
          className={cn(
            'fixed z-100 box-border w-toggletip max-w-full max-h-toggletip-h',
            'flex flex-col bg-surface-default text-text-default rounded-lg shadow-menu',
            'outline-none focus-visible:outline-2 focus-visible:outline-focus-ring',
            'animate-nav-flyout-in motion-reduce:animate-none',
          )}
        >
          <header className="flex flex-none items-start justify-between gap-6 ps-8 pe-4 pt-6 pb-4 border-b border-border-divider">
            <span className="flex flex-col gap-1 min-w-0">
              <Text as="h2" size="body" weight="semibold" id={titleId}>{title}</Text>
              {subtitle ? <Text size="body-sm" tone="secondary">{subtitle}</Text> : null}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className={cn(
                'flex flex-none items-center justify-center size-button-sm p-0 border-0 rounded-sm cursor-pointer',
                'bg-transparent text-icon-muted hover:bg-surface-hover',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              )}
            >
              <Icon name="close" size="sm" tone="inherit" />
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 py-6">
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
