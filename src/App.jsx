import React, { useState, useMemo } from 'react';
import { Package, Truck, Users, Plug, ShoppingBag, Check, X, ChevronRight, Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { LOGO } from './logo.js';
import { api } from './api.js';

const money = (n) => `$${Number(n).toFixed(2)}`;

const SEED_CLIENTS = [
  { id: 'c1', name: 'Sparkle in Pink', markup: 18, origin: '84003' },
  { id: 'c2', name: 'House accounts', markup: 12, origin: '84057' },
];

export default function App() {
  const [tab, setTab] = useState('ship');
  const [clients, setClients] = useState(SEED_CLIENTS);
  const [clientId, setClientId] = useState('c1');
  const [shipments, setShipments] = useState([]);
  const [cfg, setCfg] = useState({
    carriers: { england: true, ups: false, fedex: false },
    customerId: '', upsAccount: '', fedexAccount: '',
    sender: { name: '', company: '', address1: '', city: '', state: '', zip: '84003' },
  });
  const client = clients.find((c) => c.id === clientId) || clients[0];
  const profit = useMemo(() => shipments.reduce((s, x) => s + (x.sell - x.cost), 0), [shipments]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <header className="border-b border-neutral-800 sticky top-0 z-20 bg-neutral-950">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src={LOGO} alt="Daisy" className="w-8 h-8 rounded-full ring-2 ring-sky-500/60 object-cover" />
          <span className="font-extrabold tracking-tight text-[17px]">Daisy<span className="text-sky-400">Ship</span></span>
          <div className="flex-1" />
          <div className="text-right leading-tight">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">profit booked</div>
            <div className="font-mono text-amber-400 font-semibold">{money(profit)}</div>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 -mb-px">
          {[['ship', 'Ship', Package], ['shipments', 'Shipments', Truck], ['clients', 'Clients', Users], ['accounts', 'Accounts', Plug], ['shopify', 'Shopify', ShoppingBag]].map(([id, l, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 ${tab === id ? 'border-sky-400 text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}>
              <Icon className="w-4 h-4" />{l}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'ship' && <Ship client={client} clients={clients} setClientId={setClientId} cfg={cfg} onBuy={(s) => setShipments((p) => [s, ...p])} />}
        {tab === 'shipments' && <Shipments shipments={shipments} />}
        {tab === 'clients' && <Clients clients={clients} setClients={setClients} />}
        {tab === 'accounts' && <Accounts cfg={cfg} setCfg={setCfg} />}
        {tab === 'shopify' && <Shopify cfg={cfg} client={client} />}
      </main>
    </div>
  );
}

function useQuote() {
  const [quotes, setQuotes] = useState(null);
  const [errors, setErrors] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (payload) => {
    setLoading(true); setErr(null); setErrors(null);
    try {
      const r = await api.quote(payload);
      setQuotes(r.quotes); setErrors(r.errors && Object.keys(r.errors).length ? r.errors : null);
    } catch (e) { setErr(String(e.message || e)); setQuotes(null); }
    finally { setLoading(false); }
  };
  return { quotes, errors, loading, err, run, setQuotes };
}

function Ship({ client, clients, setClientId, cfg, onBuy }) {
  const [to, setTo] = useState({ name: '', address1: '', city: '', state: '', zip: '90210' });
  const [dims, setDims] = useState({ L: 12, W: 9, H: 4 });
  const [weight, setWeight] = useState(3);
  const [residential, setRes] = useState(true);
  const [signature, setSig] = useState(false);
  const [bought, setBought] = useState(null);
  const { quotes, errors, loading, err, run } = useQuote();

  const carriers = Object.entries(cfg.carriers).filter(([, v]) => v).map(([k]) => k);
  const shipment = { fromZip: client.origin, toZip: to.zip, residential, signature, pieces: [{ weight, length: dims.L, width: dims.W, height: dims.H }] };
  const getRates = () => run({ carriers, shipment, customerId: cfg.customerId, account: { ups: cfg.upsAccount, fedex: cfg.fedexAccount }, markup: client.markup });

  const buy = async (q) => {
    setBought(q.serviceCode + '-pending');
    try {
      const payload = {
        carrierCode: (q.carrier || '').toLowerCase(), serviceCode: q.serviceCode,
        sender: { ...cfg.sender, country: 'US', zip: client.origin },
        receiver: { ...to, country: 'US' },
        residential, weightUnit: 'lb', dimUnit: 'in',
        pieces: [{ weight: String(weight), length: String(dims.L), width: String(dims.W), height: String(dims.H) }],
        contentDescription: 'Goods',
      };
      const r = await api.ship({ payload, customerId: cfg.customerId });
      const sh = r.shipment || {};
      onBuy({ id: Date.now(), tracking: sh.trackingNumber || sh.bookNumber || 'created', client: client.name, service: q.service, cost: q.cost, sell: q.sell, date: new Date().toLocaleDateString() });
      setBought(q.serviceCode);
      setTimeout(() => setBought(null), 1800);
    } catch (e) { alert('Label creation failed: ' + (e.message || e)); setBought(null); }
  };

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 space-y-4">
        <Panel title="Shipment">
          <Field label="Billing to">
            <Select value={client.id} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.markup}%</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From ZIP"><Input value={client.origin} readOnly className="text-neutral-500" /></Field>
            <Field label="To ZIP"><Input value={to.zip} onChange={(e) => setTo({ ...to, zip: e.target.value })} /></Field>
          </div>
          <Field label="Ship to (for label)">
            <Input value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} placeholder="Name" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Input value={to.city} onChange={(e) => setTo({ ...to, city: e.target.value })} placeholder="City" />
            <Input value={to.state} onChange={(e) => setTo({ ...to, state: e.target.value })} placeholder="ST" />
            <Input value={to.address1} onChange={(e) => setTo({ ...to, address1: e.target.value })} placeholder="Street" />
          </div>
          <Field label="Dimensions (in)">
            <div className="grid grid-cols-3 gap-2">
              {['L', 'W', 'H'].map((k) => <Input key={k} type="number" value={dims[k]} onChange={(e) => setDims({ ...dims, [k]: +e.target.value })} />)}
            </div>
          </Field>
          <Field label="Weight (lb)"><Input type="number" value={weight} onChange={(e) => setWeight(+e.target.value)} /></Field>
          <div className="flex gap-2 pt-1">
            <Toggle on={residential} set={setRes} label="Residential" />
            <Toggle on={signature} set={setSig} label="Signature" />
          </div>
          <button onClick={getRates} disabled={loading || !carriers.length} className="w-full mt-1 text-sm bg-sky-400 text-neutral-950 rounded px-4 py-2 font-medium hover:bg-sky-300 flex items-center justify-center gap-1.5 disabled:opacity-50">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Getting rates…</> : <>Get live rates</>}
          </button>
          {!carriers.length && <p className="text-[11px] text-amber-400">Enable a carrier in the Accounts tab first.</p>}
        </Panel>
      </section>

      <section className="lg:col-span-3">
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">Rate shop</h2>
        {err && <ErrBox msg={err} />}
        {errors && Object.entries(errors).map(([c, m]) => <ErrBox key={c} msg={`${c.toUpperCase()}: ${m}`} />)}
        {!quotes && !err && <Empty icon={Truck} title="No rates yet" body="Fill the shipment and hit Get live rates." />}
        <div className="space-y-2">
          {(quotes || []).map((q, i) => {
            const best = i === 0;
            const isBought = bought === q.serviceCode;
            return (
              <div key={(q.serviceCode || '') + i} className={`border rounded-lg p-3 flex items-center gap-4 ${best ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-900/40'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium truncate">{q.service}</span>{best && <span className="text-[10px] uppercase text-emerald-400 border border-emerald-500/40 rounded px-1">best</span>}</div>
                  <div className="text-[11px] text-sky-400/80 mt-0.5">{q.carrier}{q.zone ? ` · zone ${q.zone}` : ''}</div>
                </div>
                <Col label="cost" val={money(q.cost)} cls="text-neutral-400 hidden sm:block" />
                <Col label="price" val={money(q.sell)} cls="text-neutral-100 font-semibold" />
                <Col label="margin" val={'+' + money(q.margin)} cls="text-amber-400 font-semibold w-16" />
                <button onClick={() => buy(q)} className={`shrink-0 w-24 text-sm rounded px-3 py-2 font-medium flex items-center justify-center gap-1 ${isBought ? 'bg-emerald-500 text-neutral-950' : 'bg-sky-400 text-neutral-950 hover:bg-sky-300'}`}>
                  {isBought ? <><Check className="w-4 h-4" />Done</> : <>Buy<ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Shipments({ shipments }) {
  if (!shipments.length) return <Empty icon={Truck} title="No shipments yet" body="Buy a label on the Ship tab." />;
  const tc = shipments.reduce((s, x) => s + x.cost, 0), ts = shipments.reduce((s, x) => s + x.sell, 0);
  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900 text-[11px] uppercase tracking-widest text-neutral-500">
          <tr><th className="text-left font-medium px-3 py-2.5">Tracking</th><th className="text-left font-medium px-3 py-2.5">Client</th><th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Service</th><th className="text-right font-medium px-3 py-2.5">Cost</th><th className="text-right font-medium px-3 py-2.5">Price</th><th className="text-right font-medium px-3 py-2.5">Margin</th></tr>
        </thead>
        <tbody className="font-mono">
          {shipments.map((s) => <tr key={s.id} className="border-t border-neutral-800"><td className="px-3 py-2.5 text-neutral-300">{s.tracking}</td><td className="px-3 py-2.5 text-neutral-400" style={{ fontFamily: 'sans-serif' }}>{s.client}</td><td className="px-3 py-2.5 text-neutral-400 hidden md:table-cell" style={{ fontFamily: 'sans-serif' }}>{s.service}</td><td className="px-3 py-2.5 text-right text-neutral-400">{money(s.cost)}</td><td className="px-3 py-2.5 text-right text-neutral-100">{money(s.sell)}</td><td className="px-3 py-2.5 text-right text-amber-400">+{money(s.sell - s.cost)}</td></tr>)}
        </tbody>
        <tfoot className="bg-neutral-900 font-mono border-t border-neutral-800"><tr><td colSpan={3} className="px-3 py-2.5 text-[11px] uppercase tracking-widest text-neutral-500" style={{ fontFamily: 'sans-serif' }}>{shipments.length} shipments</td><td className="px-3 py-2.5 text-right text-neutral-400">{money(tc)}</td><td className="px-3 py-2.5 text-right text-neutral-100">{money(ts)}</td><td className="px-3 py-2.5 text-right text-amber-400 font-semibold">+{money(ts - tc)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function Clients({ clients, setClients }) {
  const set = (id, v) => setClients((cs) => cs.map((c) => c.id === id ? { ...c, markup: Math.max(0, v) } : c));
  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-sm text-neutral-400">Markup is your cut on every label this client ships.</p>
      {clients.map((c) => (
        <div key={c.id} className="border border-neutral-800 rounded-lg p-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded bg-neutral-800 flex items-center justify-center text-sky-400 font-semibold">{c.name[0]}</div>
          <div className="flex-1"><div className="font-medium text-neutral-100">{c.name}</div><div className="text-[11px] text-neutral-500 font-mono">origin {c.origin}</div></div>
          <button onClick={() => set(c.id, c.markup - 1)} className="w-7 h-7 rounded bg-neutral-800 hover:bg-neutral-700">–</button>
          <div className="w-14 text-center font-mono text-sky-400 font-semibold">{c.markup}%</div>
          <button onClick={() => set(c.id, c.markup + 1)} className="w-7 h-7 rounded bg-neutral-800 hover:bg-neutral-700">+</button>
        </div>
      ))}
    </div>
  );
}

function Accounts({ cfg, setCfg }) {
  const toggle = (k) => setCfg((c) => ({ ...c, carriers: { ...c.carriers, [k]: !c.carriers[k] } }));
  const rows = [
    { k: 'england', name: 'England Logistics', env: 'ENGLAND_API_KEY', extra: <Field label="Customer ID (optional override)"><Input value={cfg.customerId} onChange={(e) => setCfg({ ...cfg, customerId: e.target.value })} placeholder="defaults to ENGLAND_CUSTOMER_ID" /></Field> },
    { k: 'ups', name: 'UPS', env: 'UPS_CLIENT_ID / UPS_CLIENT_SECRET', extra: <Field label="UPS account # (Shipper Number)"><Input value={cfg.upsAccount} onChange={(e) => setCfg({ ...cfg, upsAccount: e.target.value })} placeholder="defaults to UPS_ACCOUNT" /></Field> },
    { k: 'fedex', name: 'FedEx (direct)', env: 'FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET', extra: <Field label="FedEx account #"><Input value={cfg.fedexAccount} onChange={(e) => setCfg({ ...cfg, fedexAccount: e.target.value })} placeholder="defaults to FEDEX_ACCOUNT" /></Field> },
  ];
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-neutral-400">Secrets live in Netlify env vars (never in the browser). Toggle which carriers to rate-shop and set any per-request overrides.</p>
      {rows.map((r) => (
        <Panel key={r.k} title={r.name}>
          <div className="flex items-center gap-3">
            <Toggle on={cfg.carriers[r.k]} set={() => toggle(r.k)} label={cfg.carriers[r.k] ? 'On' : 'Off'} />
            <span className="text-[11px] text-neutral-500 font-mono">keys: {r.env}</span>
          </div>
          {cfg.carriers[r.k] && r.extra}
        </Panel>
      ))}
      <Panel title="Default sender (for labels)">
        <div className="grid grid-cols-2 gap-2">
          <Input value={cfg.sender.name} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, name: e.target.value } })} placeholder="Name" />
          <Input value={cfg.sender.company} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, company: e.target.value } })} placeholder="Company" />
          <Input value={cfg.sender.address1} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, address1: e.target.value } })} placeholder="Street" />
          <Input value={cfg.sender.city} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, city: e.target.value } })} placeholder="City" />
          <Input value={cfg.sender.state} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, state: e.target.value } })} placeholder="ST" />
          <Input value={cfg.sender.zip} onChange={(e) => setCfg({ ...cfg, sender: { ...cfg.sender, zip: e.target.value } })} placeholder="ZIP" />
        </div>
      </Panel>
    </div>
  );
}

function Shopify({ cfg, client }) {
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [track, setTrack] = useState({});
  const [done, setDone] = useState({});

  const load = async () => {
    setLoading(true); setErr(null);
    try { const r = await api.shopifyOrders(); setOrders(r.orders); }
    catch (e) { setErr(String(e.message || e)); }
    finally { setLoading(false); }
  };
  const fulfill = async (o) => {
    try { await api.shopifyFulfill({ orderId: o.id, trackingNumber: track[o.id] || '', carrier: 'FedEx' }); setDone((d) => ({ ...d, [o.id]: true })); }
    catch (e) { alert('Fulfill failed: ' + (e.message || e)); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">Pull unfulfilled orders, ship them, and push tracking back to Shopify.</p>
        <button onClick={load} disabled={loading} className="text-sm bg-neutral-800 hover:bg-neutral-700 rounded px-3 py-1.5 flex items-center gap-1.5">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}Load orders</button>
      </div>
      {err && <ErrBox msg={err} />}
      {orders && !orders.length && <Empty icon={ShoppingBag} title="No unfulfilled orders" body="You're all caught up." />}
      {(orders || []).map((o) => (
        <div key={o.id} className="border border-neutral-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium text-neutral-100">{o.name} · {o.customer}</div>
              <div className="text-[11px] text-neutral-500">{o.shipTo ? `${o.shipTo.city}, ${o.shipTo.state} ${o.shipTo.zip}` : 'no address'} · {o.items.map((i) => `${i.qty}× ${i.title}`).join(', ')}</div>
            </div>
            <div className="font-mono text-neutral-300">{o.currency} {o.total}</div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Input value={track[o.id] || ''} onChange={(e) => setTrack({ ...track, [o.id]: e.target.value })} placeholder="tracking #" className="flex-1" />
            <button onClick={() => fulfill(o)} className={`text-sm rounded px-3 py-2 font-medium ${done[o.id] ? 'bg-emerald-500 text-neutral-950' : 'bg-sky-400 text-neutral-950 hover:bg-sky-300'}`}>{done[o.id] ? 'Fulfilled' : 'Mark fulfilled'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* primitives */
function Panel({ title, children }) { return <div className="border border-neutral-800 rounded-lg bg-neutral-900/40 p-4 space-y-3"><div className="text-[11px] uppercase tracking-widest text-neutral-500">{title}</div>{children}</div>; }
function Field({ label, children }) { return <label className="block space-y-1"><span className="text-[11px] text-neutral-500">{label}</span>{children}</label>; }
function Input({ className = '', ...p }) { return <input {...p} className={`w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-2 text-sm font-mono focus:border-sky-400 outline-none ${className}`} />; }
function Select({ children, ...p }) { return <select {...p} className="w-full bg-neutral-900 border border-neutral-800 rounded px-2.5 py-2 text-sm focus:border-sky-400 outline-none">{children}</select>; }
function Toggle({ on, set, label }) { return <button onClick={() => set(!on)} className={`flex items-center gap-1.5 text-xs rounded px-2.5 py-1.5 border ${on ? 'bg-sky-400/10 border-sky-400/40 text-sky-300' : 'bg-neutral-900 border-neutral-800 text-neutral-500'}`}>{on ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{label}</button>; }
function Col({ label, val, cls }) { return <div className={`text-right font-mono leading-tight ${cls}`}><div className="text-[10px] uppercase tracking-widest text-neutral-600">{label}</div><div className="text-sm">{val}</div></div>; }
function Empty({ icon: Icon, title, body }) { return <div className="border border-dashed border-neutral-800 rounded-lg p-12 text-center"><Icon className="w-8 h-8 text-neutral-700 mx-auto mb-3" /><div className="text-neutral-300 font-medium">{title}</div><div className="text-sm text-neutral-500 mt-1 max-w-sm mx-auto">{body}</div></div>; }
function ErrBox({ msg }) { return <div className="flex items-start gap-2 text-[12px] text-amber-300 border border-amber-500/30 bg-amber-500/5 rounded p-2.5 mb-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span className="font-mono">{msg}</span></div>; }
