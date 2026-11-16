import { useEffect, useMemo, useState } from 'react';
import { AppShell, Banner, Icon, Nav, TopBar } from '@canon';
import type { NavNode, TopBarAction } from '@canon';
import { HISTORY_MARK } from '../data/books';
import { InvoiceWithBins } from './InvoiceWithBins';

/**
 * BIN & BATCH DETAILS AT TRANSACTION — the prototype's shell.
 *
 * One screen: Sales → Invoices → New Invoice in Zoho Inventory, with the Item
 * Details panel on the right. Everything outside it raises a
 * "Not a part of this prototype" toast and leaves the page where it was.
 */
const OUTSIDE = 'Not a part of this prototype';
const TOAST_MS = 2600;
const INVENTORY_MARK = <Icon name="inventory" size="xl" tone="inherit" />;

export function BinBatchApp() {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [outsideAt, setOutsideAt] = useState(0);
  const outside = () => setOutsideAt((n) => n + 1);
  useEffect(() => {
    if (!outsideAt) return undefined;
    const t = window.setTimeout(() => setOutsideAt(0), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [outsideAt]);

  const NAV_ITEMS: NavNode[] = useMemo(() => [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'items', label: 'Items', icon: 'items', children: [{ id: 'all-items', label: 'Items' }] },
    { id: 'inventory', label: 'Inventory', icon: 'inventory', children: [{ id: 'adjustments', label: 'Inventory Adjustments' }] },
    {
      id: 'sales', label: 'Sales', icon: 'sales',
      children: [
        { id: 'customers', label: 'Customers' },
        { id: 'retainer-invoices', label: 'Retainer Invoices' },
        { id: 'sales-orders', label: 'Sales Orders' },
        { id: 'invoices', label: 'Invoices', action: { label: 'New Invoice', onSelect: () => setFormKey((k) => k + 1) } },
        { id: 'payments-received', label: 'Payments Received' },
        { id: 'sales-returns', label: 'Sales Returns' },
        { id: 'credit-notes', label: 'Credit Notes' },
      ],
    },
    { id: 'purchases', label: 'Purchases', icon: 'purchases', children: [{ id: 'bills', label: 'Bills' }] },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'documents', label: 'Documents', icon: 'documents' },
  ], []);

  const APP_SECTIONS = useMemo(() => [
    { header: 'Apps', items: [{ id: 'shopify', label: 'Shopify' }, { id: 'zoho-payments', label: 'Zoho Payments' }] as NavNode[] },
  ], []);

  const actions: TopBarAction[] = [
    { id: 'new', label: 'Create new', icon: 'plus', filled: true, onSelect: () => setFormKey((k) => k + 1) },
    { id: 'invite', label: 'Invite users', icon: 'users', onSelect: outside },
    { id: 'notifications', label: 'Notifications', icon: 'bell', count: 2, onSelect: outside },
    { id: 'settings', label: 'Settings', icon: 'settings', onSelect: outside },
  ];

  return (
    <AppShell
      nav={(
        <Nav
          items={NAV_ITEMS}
          sections={APP_SECTIONS}
          currentId="invoices"
          onNavigate={(id) => { if (id === 'invoices') setFormKey((k) => k + 1); else outside(); }}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          product={{ name: 'Inventory', mark: INVENTORY_MARK }}
        />
      )}
      topBar={(
        <TopBar
          leading={[{ id: 'recent', label: 'Recent activity', icon: HISTORY_MARK, onSelect: outside }]}
          search={{ scope: 'Invoices', value: query, onValueChange: setQuery, onSubmit: outside, onScopeOpen: outside }}
          org={{ name: 'qbooks us', onOpen: outside }}
          actions={actions}
          account={{ name: 'Rithika Rajesh', initials: 'RR', onOpen: outside }}
        />
      )}
    >
      {flash ? <Banner tone="success" onDismiss={() => setFlash(null)}>{flash}</Banner> : null}
      <InvoiceWithBins
        key={formKey}
        onCancel={outside}
        onSaved={(inv) => { setFlash(`${inv} saved. Its bin, batch and serial picks are reserved.`); setFormKey((k) => k + 1); }}
      />
      {outsideAt ? <Banner tone="info" placement="toast" onDismiss={() => setOutsideAt(0)}>{OUTSIDE}</Banner> : null}
    </AppShell>
  );
}
