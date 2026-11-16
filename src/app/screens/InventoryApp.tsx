import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell, Banner, Icon, Nav, TopBar,
} from '@canon';
import type { NavNode, TopBarAction } from '@canon';
import { HISTORY_MARK } from '../data/books';
import { InventoryStatusSettings } from './InventoryStatusSettings';
import { InventoryStatusStats } from './InventoryStatusStats';
import { ItemStock } from './ItemStock';
import { StatusChangeDetails } from './StatusChangeDetails';
import type { StatsFilter } from '../data/inventory';
import { NewBill } from './NewBill';
import { UpdateStatus } from './UpdateStatus';

/**
 * INVENTORY STATUS — the prototype's router.
 *
 * The wireframe's flow diagram is four steps, and each has its own home:
 *
 *   1. Create Status                         Settings → Inventory → Inventory Status
 *   2. Update / associate items to a status  Inventory → Inventory Status → Update Status
 *   3. Associate status to incoming items    Purchases → Bills → New Bill
 *   4. View the breakdown on the item        Items → an item → Locations / Batch Details
 *
 * Settings is a different SHELL, not a different page: its rail is the
 * settings tree and its bar closes back to the app, as in the wireframe's
 * first frame.
 *
 * Anything outside those four steps — the rest of the rail, the bar's account
 * cluster, the item's Edit — does not route anywhere. It raises a toast saying
 * so, and the page the user was on stays exactly where it was.
 */
type Route =
  | { area: 'settings' }
  | { area: 'app'; page: 'stats' }
  | { area: 'app'; page: 'update'; itemId?: string }
  | { area: 'app'; page: 'new-bill' }
  | { area: 'app'; page: 'item'; itemId: string }
  | { area: 'app'; page: 'change'; id: string };

const OUTSIDE = 'Not a part of this prototype';

//  Zoho Inventory's mark is the rail's own `inventory` glyph — filled, so it
//  holds its weight at 24. It inherits the band's colour: white on the dark
//  band, `text/default` on the settings band.
const INVENTORY_MARK = <Icon name="inventory" size="xl" tone="inherit" />;
const TOAST_MS = 2600;

const APP_SECTIONS: { header: string; items: NavNode[] }[] = [
  {
    header: 'Sales Channel',
    items: [{ id: 'retail-store', label: 'Retail Store', icon: 'sales', children: [{ id: 'pos', label: 'Point of Sale' }] }],
  },
];

const SETTINGS_SECTIONS: { header: string; items: NavNode[] }[] = [
  {
    header: 'Organization Settings',
    items: [
      { id: 's-org', label: 'Organization', children: [{ id: 's-profile', label: 'Profile' }, { id: 's-branding', label: 'Branding' }] },
      { id: 's-users', label: 'Users & Roles', children: [{ id: 's-users-list', label: 'Users' }, { id: 's-roles', label: 'Roles' }] },
      { id: 's-tax', label: 'Taxes & Compliance', children: [{ id: 's-taxes', label: 'Taxes' }] },
      { id: 's-setup', label: 'Setup & Configurations', children: [{ id: 's-general-setup', label: 'General' }] },
      { id: 's-custom', label: 'Customization', children: [{ id: 's-pdf', label: 'PDF Templates' }] },
      { id: 's-auto', label: 'Automation', children: [{ id: 's-workflows', label: 'Workflow Rules' }] },
    ],
  },
  {
    header: 'Module Settings',
    items: [
      { id: 's-general', label: 'General', children: [{ id: 's-customers', label: 'Customers and Vendors' }] },
      {
        id: 's-inventory', label: 'Inventory',
        children: [
          { id: 's-inventory-status', label: 'Inventory Status' },
          { id: 's-assemblies', label: 'Assemblies' },
          { id: 's-adjustments', label: 'Inventory Adjustments' },
          { id: 's-stock-counts', label: 'Stock Counts' },
          { id: 's-picklists', label: 'Picklists' },
          { id: 's-packages', label: 'Packages' },
        ],
      },
      { id: 's-sales', label: 'Sales', children: [{ id: 's-sales-orders', label: 'Sales Orders' }] },
      { id: 's-purchases', label: 'Purchases', children: [{ id: 's-bills', label: 'Bills' }] },
    ],
  },
];

export function InventoryApp() {
  const [route, setRoute] = useState<Route>({ area: 'settings' });
  //  The stats list's filter lives here, not on the page: a row opens a detail
  //  view whose mini list IS that list, and Back has to land on the same one.
  const [statsFilter, setStatsFilter] = useState<StatsFilter>({ period: 'month', location: 'all' });
  const [flash, setFlash] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  //  A counter, not a boolean, so a second click while the toast is up restarts
  //  its timer instead of letting the first one expire it early.
  const [outsideAt, setOutsideAt] = useState(0);
  const outside = () => setOutsideAt((n) => n + 1);
  //  For the rail's `+` actions, which are built once (see `go` below).
  const outsideRef = useRef(outside);
  outsideRef.current = outside;
  useEffect(() => {
    if (!outsideAt) return undefined;
    const t = window.setTimeout(() => setOutsideAt(0), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [outsideAt]);
  const toast = outsideAt
    ? <Banner tone="info" placement="toast" onDismiss={() => setOutsideAt(0)}>{OUTSIDE}</Banner>
    : null;

  //  The nav's `+` actions have to reach `setRoute`, but `Nav` compares node
  //  identity between renders — so the tree is built once and calls through a
  //  ref rather than closing over state.
  const go = useRef<(r: Route) => void>(() => {});
  go.current = (r) => { setRoute(r); setFlash(null); setOutsideAt(0); };

  //  The rail as Zoho Inventory draws it (the Move Orders screenshot), with
  //  Inventory Status added under Inventory — the flow's own page.
  const NAV_ITEMS: NavNode[] = useMemo(() => [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'items', label: 'Items', icon: 'items', children: [{ id: 'all-items', label: 'Items' }, { id: 'price-lists', label: 'Price Lists' }] },
    {
      id: 'inventory', label: 'Inventory', icon: 'inventory',
      badge: { value: '3', description: 'replenishments pending' },
      children: [
        { id: 'assemblies', label: 'Assemblies' },
        { id: 'inventory-adjustments', label: 'Inventory Adjustments' },
        { id: 'inventory-status', label: 'Inventory Status', action: { label: 'Update Status', onSelect: () => go.current({ area: 'app', page: 'update' }) } },
        { id: 'replenishments', label: 'Replenishments', badge: { value: '3', description: 'pending' } },
        { id: 'stock-counts', label: 'Stock Counts' },
        { id: 'picklists', label: 'Picklists' },
        { id: 'packages', label: 'Packages' },
        { id: 'shipments', label: 'Shipments' },
        { id: 'transfer-orders', label: 'Transfer Orders' },
        { id: 'move-orders', label: 'Move Orders', action: { label: 'New Move Order', onSelect: () => outsideRef.current() } },
        { id: 'putaways', label: 'Putaways' },
      ],
    },
    { id: 'sales', label: 'Sales', icon: 'sales', children: [{ id: 'sales-orders', label: 'Sales Orders' }, { id: 'invoices', label: 'Invoices' }] },
    {
      id: 'purchases', label: 'Purchases', icon: 'purchases',
      children: [
        { id: 'vendors', label: 'Vendors' },
        { id: 'purchase-orders', label: 'Purchase Orders' },
        { id: 'bills', label: 'Bills', action: { label: 'New Bill', onSelect: () => go.current({ area: 'app', page: 'new-bill' }) } },
      ],
    },
    { id: 'reports', label: 'Reports', icon: 'reports' },
    { id: 'documents', label: 'Documents', icon: 'documents' },
  ], []);

  const navigate = (id: string) => {
    if (id === 'inventory-status') go.current({ area: 'app', page: 'stats' });
    else if (id === 'bills') go.current({ area: 'app', page: 'new-bill' });
    else if (id === 'all-items') go.current({ area: 'app', page: 'item', itemId: 'plate' });
    else outside();
  };

  const appActions: TopBarAction[] = [
    { id: 'new', label: 'Create new', icon: 'plus', filled: true, onSelect: () => go.current({ area: 'app', page: 'new-bill' }) },
    { id: 'invite', label: 'Invite users', icon: 'users', onSelect: outside },
    { id: 'notifications', label: 'Notifications', icon: 'bell', count: 62, onSelect: outside },
    { id: 'settings', label: 'Settings', icon: 'settings', onSelect: () => go.current({ area: 'settings' }) },
  ];

  if (route.area === 'settings') {
    return (
      //  KEYED, and so is the app shell below. Both render a Nav in the same
      //  slot, so without keys React keeps ONE Nav across the switch and its
      //  open-branch state comes with it — leaving Close Settings, the app
      //  rail arrived with Inventory shut and the current page hidden.
      <AppShell
        key="settings"
        nav={(
          <Nav
            tone="surface"
            items={[]}
            sections={SETTINGS_SECTIONS}
            currentId="s-inventory-status"
            onNavigate={(id) => { if (id !== 's-inventory-status') outside(); }}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            product={{
              name: 'All Settings', subtitle: 'The Retail Store Inc', mark: INVENTORY_MARK,
              onBack: () => go.current({ area: 'app', page: 'stats' }), backLabel: 'Back to Inventory',
            }}
            label="Settings"
          />
        )}
        topBar={(
            <TopBar
              tone="surface"
              search={{ scope: 'Settings', value: query, onValueChange: setQuery, onSubmit: outside, onScopeOpen: outside }}
              actions={[{
                id: 'close', label: 'Close Settings', icon: 'close', labelled: true, intent: 'danger',
                onSelect: () => go.current({ area: 'app', page: 'stats' }),
              }]}
            />
        )}
      >
        <InventoryStatusSettings />
        {toast}
      </AppShell>
    );
  }

  const currentId = route.page === 'stats' || route.page === 'update' || route.page === 'change' ? 'inventory-status'
    : route.page === 'new-bill' ? 'bills'
      : route.page === 'item' ? 'all-items'
        : 'inventory-status';

  const screen = route.page === 'stats' ? (
    <InventoryStatusStats
      filter={statsFilter}
      onFilterChange={setStatsFilter}
      onUpdate={() => go.current({ area: 'app', page: 'update' })}
      onOpenItem={(itemId) => go.current({ area: 'app', page: 'item', itemId })}
      onOpenChange={(id) => go.current({ area: 'app', page: 'change', id })}
    />
  ) : route.page === 'change' ? (
    <StatusChangeDetails
      changeId={route.id}
      filter={statsFilter}
      onFilterChange={setStatsFilter}
      onSelect={(id) => go.current({ area: 'app', page: 'change', id })}
      onBack={() => go.current({ area: 'app', page: 'stats' })}
      onOpenItem={(itemId) => go.current({ area: 'app', page: 'item', itemId })}
      onUpdateStatus={(itemId) => go.current({ area: 'app', page: 'update', itemId: itemId || undefined })}
      onOutside={outside}
    />
  ) : route.page === 'update' ? (
    <UpdateStatus
      itemId={route.itemId}
      onCancel={() => go.current({ area: 'app', page: 'stats' })}
      onSaved={() => { setRoute({ area: 'app', page: 'stats' }); setFlash('Inventory status updated.'); }}
    />
  ) : route.page === 'new-bill' ? (
    <NewBill
      onCancel={() => go.current({ area: 'app', page: 'stats' })}
      onSaved={(bill) => { setRoute({ area: 'app', page: 'stats' }); setFlash(`${bill} saved. The received stock is in the statuses you chose.`); }}
    />
  ) : route.page === 'item' ? (
    <ItemStock
      itemId={route.itemId}
      onSelect={(itemId) => go.current({ area: 'app', page: 'item', itemId })}
      onBack={() => go.current({ area: 'app', page: 'stats' })}
      onUpdateStatus={(itemId) => go.current({ area: 'app', page: 'update', itemId })}
      onOutside={outside}
    />
  ) : null;

  return (
    <AppShell
      key="app"
      nav={(
        <Nav
          items={NAV_ITEMS}
          sections={APP_SECTIONS}
          currentId={currentId}
          onNavigate={navigate}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          product={{ name: 'Inventory', mark: INVENTORY_MARK }}
        />
      )}
      topBar={(
        <TopBar
          leading={[{ id: 'recent', label: 'Recent activity', icon: HISTORY_MARK, onSelect: outside }]}
          search={{ scope: route.page === 'new-bill' ? 'Bills' : route.page === 'item' ? 'Items' : 'Inventory', value: query, onValueChange: setQuery, onSubmit: outside, onScopeOpen: outside }}
          org={{ name: 'The Retail Store Inc', onOpen: outside }}
          actions={appActions}
          account={{ name: 'Rithika Rajesh', initials: 'RR', onOpen: outside }}
        />
      )}
    >
      {flash ? <Banner tone="success" onDismiss={() => setFlash(null)}>{flash}</Banner> : null}
      {screen}
      {toast}
    </AppShell>
  );
}
