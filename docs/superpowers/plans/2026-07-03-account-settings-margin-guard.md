# Account Settings, Margin Guard & Clickable Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings modal (adjust capital via deposit/withdraw, reset the account), block orders whose margin exceeds free margin, and make positions/pending rows click-to-chart.

**Architecture:** Entirely frontend. The fixed `BALANCE` constant becomes a persisted, adjustable `capital` in the Zustand store; `computeAccount` takes `capital` as a 4th parameter (default `BALANCE`). A `SettingsModal` (gear in the Header) drives deposit/withdraw/reset. The margin guard lives authoritatively in `openPosition`/`placePending` and is surfaced in `OrderPanel`.

**Tech Stack:** React 18 + TypeScript + Zustand, CSS Modules. No new dependencies.

## Global Constraints

- **Frontend-only.** No backend, no new npm dependencies, no test framework. Verify each task with `cd frontend && npm run build` (`tsc --noEmit && vite build`) + the live checks noted.
- **Capital:** persisted under `apex.capital` (default `BALANCE = 50_000`); `computeAccount(positions, assets, history, capital = BALANCE)` → `balance = capital + realizedAll`.
- **Withdraw** is capped at current free margin. **Reset** clears positions/pending/history/orders/alerts/notices and keeps `capital`. **Margin guard** blocks an order only when `margin > free` (strict; equality allowed), for market and pending.
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/src/types.ts` | `Notice.kind` gains `'ERROR'` | Modify |
| `frontend/src/components/Toasts.module.css` | `.kERROR` toast style | Modify |
| `frontend/src/store.ts` | `capital`, deposit/withdraw/resetAccount, margin guard, `computeAccount` param | Modify |
| `frontend/src/components/SettingsModal.tsx` | Settings modal (capital + reset) | Create |
| `frontend/src/components/SettingsModal.module.css` | Modal styles | Create |
| `frontend/src/components/Header.tsx` | Gear button + modal + pass `capital` | Modify |
| `frontend/src/components/Header.module.css` | `.gear` style | Modify |
| `frontend/src/components/OrderPanel.tsx` | Margin-guard UI (inline + disabled) | Modify |
| `frontend/src/components/OrderPanel.module.css` | `.marginErr` + disabled buttons | Modify |
| `frontend/src/components/CenterPanel.tsx` | Clickable positions/pending rows | Modify |
| `frontend/src/components/CenterPanel.module.css` | `.clickRow` hover | Modify |
| `CLAUDE.md` | Document the features | Modify |

---

## Task 1: Store — capital, deposit/withdraw/reset, margin guard

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/components/Toasts.module.css`, `frontend/src/store.ts`

**Interfaces:**
- Produces: store state `capital: number`; actions `deposit(amount)`, `withdraw(amount)`, `resetAccount()`; guarded `openPosition`/`placePending`; `computeAccount(positions, assets, history, capital?)`.

- [ ] **Step 1: Add the `ERROR` notice kind (`types.ts`)**

```ts
export interface Notice {
  id: string
  kind: 'SL' | 'TP' | 'ALERT' | 'TRADE' | 'ERROR'
  text: string
  ts: number
}
```

- [ ] **Step 2: Add the `.kERROR` toast style (`Toasts.module.css`)**

Append:

```css
.kERROR { border-left-color: var(--red); }
.kERROR .kind { background: var(--red-d); color: var(--red); }
```

- [ ] **Step 3: Import `fmtUsd`, add capital LS key + persisted load (`store.ts`)**

Change the format import (line 4):

```ts
import { fmtUsd, isToday, uid } from './format'
```

Add the LS key next to the others (after `const LS_VIEW = 'apex.view'`):

```ts
const LS_CAPITAL = 'apex.capital'
```

Add the persisted load (after `const persistedSim = loadLS<SimState>(...)`):

```ts
const persistedCapital = loadLS<number>(LS_CAPITAL, BALANCE)
```

- [ ] **Step 4: Extend the `Store` interface (`store.ts`)**

Add `capital` to the state group (after `notices: Notice[]`):

```ts
  notices: Notice[]
  capital: number
```

Add the actions (after `dismissNotice: (id: string) => void`):

```ts
  dismissNotice: (id: string) => void
  deposit: (amount: number) => void
  withdraw: (amount: number) => void
  resetAccount: () => void
```

- [ ] **Step 5: Initialise `capital` in the store (`store.ts`)**

In the `create<Store>((set) => ({ ... }))` initial state, after `notices: [],`:

```ts
  notices: [],
  capital: persistedCapital,
```

- [ ] **Step 6: Guard `openPosition` and `placePending` (`store.ts`)**

Replace `openPosition`:

```ts
  openPosition: (p) =>
    set((s) => {
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      if (p.margin > free) {
        const notices = [{ id: uid(), kind: 'ERROR' as const, text: `Order blocked — margin ${fmtUsd(p.margin)} exceeds free margin ${fmtUsd(free)}`, ts: Date.now() }, ...s.notices].slice(0, 6)
        return { notices }
      }
      const positions = [...s.positions, p]
      const orders = [orderRec(p.symbol, p.dir, 'OPEN', p.lots, p.entry), ...s.orders]
      persistSim({ positions, history: s.history, orders, alerts: s.alerts, pending: s.pending })
      return { positions, orders }
    }),
```

Replace `placePending`:

```ts
  placePending: (o) =>
    set((s) => {
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      if (o.margin > free) {
        const notices = [{ id: uid(), kind: 'ERROR' as const, text: `Order blocked — margin ${fmtUsd(o.margin)} exceeds free margin ${fmtUsd(free)}`, ts: Date.now() }, ...s.notices].slice(0, 6)
        return { notices }
      }
      const pending = [o, ...s.pending]
      persistSim({ positions: s.positions, history: s.history, orders: s.orders, alerts: s.alerts, pending })
      const notices = [{ id: uid(), kind: 'TRADE' as const, text: `${o.type} ${o.dir} ${o.symbol} @ ${o.price} placed`, ts: Date.now() }, ...s.notices].slice(0, 6)
      return { pending, notices }
    }),
```

- [ ] **Step 7: Add deposit/withdraw/resetAccount (`store.ts`)**

Insert before `dismissNotice`:

```ts
  deposit: (amount) =>
    set((s) => {
      const add = Math.max(0, amount)
      if (!add) return {}
      const capital = s.capital + add
      saveLS(LS_CAPITAL, capital)
      return { capital }
    }),

  withdraw: (amount) =>
    set((s) => {
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      const w = Math.min(Math.max(0, amount), Math.max(0, free))
      if (!w) return {}
      const capital = s.capital - w
      saveLS(LS_CAPITAL, capital)
      return { capital }
    }),

  resetAccount: () =>
    set(() => {
      persistSim({ positions: [], history: [], orders: [], alerts: [], pending: [] })
      return { positions: [], pending: [], history: [], orders: [], alerts: [], notices: [] }
    }),
```

- [ ] **Step 8: Make `computeAccount` capital-aware (`store.ts`)**

```ts
export function computeAccount(positions: Position[], assets: Record<string, Asset>, history: ClosedTrade[], capital = BALANCE): Account {
```

and change the balance line:

```ts
  const balance = capital + realizedAll
```

(`computeAccount` is a hoisted function declaration, so the store actions above can call it even though it is defined lower in the file.)

- [ ] **Step 9: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (Header still calls `computeAccount` with 3 args → default `BALANCE`; wired to `capital` in Task 2.)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/Toasts.module.css frontend/src/store.ts
git commit -m "feat(account): configurable capital + margin guard in the store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Settings modal + Header gear

**Files:**
- Create: `frontend/src/components/SettingsModal.tsx`, `frontend/src/components/SettingsModal.module.css`
- Modify: `frontend/src/components/Header.tsx`, `frontend/src/components/Header.module.css`

**Interfaces:**
- Consumes: `capital`, `deposit`, `withdraw`, `resetAccount`, `computeAccount` (Task 1).

- [ ] **Step 1: Create `SettingsModal.tsx`**

```tsx
import { useState } from 'react'

import { fmtUsd } from '../format'
import { computeAccount, useStore } from '../store'
import styles from './SettingsModal.module.css'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const capital = useStore((s) => s.capital)
  const positions = useStore((s) => s.positions)
  const assets = useStore((s) => s.assets)
  const history = useStore((s) => s.history)
  const deposit = useStore((s) => s.deposit)
  const withdraw = useStore((s) => s.withdraw)
  const resetAccount = useStore((s) => s.resetAccount)

  const [amountStr, setAmountStr] = useState('')
  const [confirm, setConfirm] = useState(false)

  const free = computeAccount(positions, assets, history, capital).free
  const amount = parseFloat(amountStr) || 0

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>SETTINGS</span>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.section}>
          <div className={styles.sLabel}>ACCOUNT CAPITAL</div>
          <div className={styles.capRow}><span className={styles.capK}>Current</span><span className={styles.capV}>{fmtUsd(capital)}</span></div>
          <div className={styles.capRow}><span className={styles.capK}>Free margin</span><span className={styles.capV}>{fmtUsd(free)}</span></div>
          <input className={styles.input} type="number" min="0" step="100" placeholder="Amount ($)" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
          <div className={styles.btnRow}>
            <button className={styles.deposit} disabled={amount <= 0} onClick={() => { deposit(amount); setAmountStr('') }}>+ DEPOSIT</button>
            <button className={styles.withdraw} disabled={amount <= 0 || free <= 0} onClick={() => { withdraw(amount); setAmountStr('') }}>− WITHDRAW</button>
          </div>
          <div className={styles.hint}>Withdrawals are capped at your free margin ({fmtUsd(free)}).</div>
        </div>

        <div className={styles.section}>
          <div className={styles.sLabel}>RESET</div>
          {!confirm ? (
            <button className={styles.reset} onClick={() => setConfirm(true)}>Reset account</button>
          ) : (
            <div className={styles.confirmRow}>
              <button className={styles.confirmReset} onClick={() => { resetAccount(); onClose() }}>Confirm reset</button>
              <button className={styles.cancel} onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
          <div className={styles.hint}>Clears all positions, pending orders, trade log, order history and alerts. Capital is kept.</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `SettingsModal.module.css`**

```css
.backdrop { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
.modal { width: 340px; max-width: 92vw; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.6); overflow: hidden; }
.head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.title { font: 800 13px/1 'JetBrains Mono', monospace; letter-spacing: 1.5px; color: #eef3f8; }
.close { background: transparent; border: none; color: var(--dim); font-size: 15px; cursor: pointer; }
.close:hover { color: #eef3f8; }
.section { padding: 14px; border-bottom: 1px solid var(--border); }
.section:last-child { border-bottom: none; }
.sLabel { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 1.5px; color: var(--dim); margin-bottom: 10px; }
.capRow { display: flex; justify-content: space-between; align-items: baseline; font: 700 12px/1.9 'JetBrains Mono', monospace; }
.capK { color: var(--gray); }
.capV { color: #eef3f8; font-weight: 800; font-variant-numeric: tabular-nums; }
.input { width: 100%; margin-top: 10px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); font-size: 13px; border-radius: 6px; padding: 8px 10px; outline: none; font-family: var(--font); box-sizing: border-box; }
.input:focus { border-color: var(--amber); }
.btnRow { display: flex; gap: 8px; margin-top: 10px; }
.deposit, .withdraw { flex: 1; border: none; font: 800 11px/1 'JetBrains Mono', monospace; letter-spacing: .5px; padding: 9px 0; border-radius: 6px; cursor: pointer; }
.deposit { background: var(--green); color: #06210f; }
.withdraw { background: var(--panel-2); color: #cfd8e3; border: 1px solid var(--border-2); }
.deposit:disabled, .withdraw:disabled { opacity: .4; cursor: not-allowed; }
.hint { font: 600 9.5px/1.4 'JetBrains Mono', monospace; color: var(--dim); margin-top: 8px; }
.reset { width: 100%; background: transparent; color: var(--red); border: 1px solid var(--red-d); font: 800 11px/1 'JetBrains Mono', monospace; letter-spacing: .5px; padding: 9px 0; border-radius: 6px; cursor: pointer; }
.reset:hover { background: rgba(255,23,68,.08); }
.confirmRow { display: flex; gap: 8px; }
.confirmReset { flex: 1; background: var(--red); color: #fff; border: none; font: 800 11px/1 'JetBrains Mono', monospace; padding: 9px 0; border-radius: 6px; cursor: pointer; }
.cancel { flex: 1; background: var(--panel-2); color: #cfd8e3; border: 1px solid var(--border-2); font: 800 11px/1 'JetBrains Mono', monospace; padding: 9px 0; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 3: Wire the gear + modal into `Header.tsx`**

Change the imports at the top:

```tsx
import { useState } from 'react'

import { computeAccount, useStore } from '../store'
import { arrow, fmt, fmtPct, fmtUsd, signClass } from '../format'
import SettingsModal from './SettingsModal'
import styles from './Header.module.css'
```

Read `capital` and add modal state (inside the component, with the other `useStore` reads):

```ts
  const capital = useStore((s) => s.capital)
  const [settingsOpen, setSettingsOpen] = useState(false)
```

Use `capital` in the account computation:

```ts
  const acct = computeAccount(positions, assets, history, capital)
```

Add the gear button inside the `.net` div (after the `.status` span):

```tsx
          <button className={styles.gear} onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
```

Render the modal just before the closing `</>` of the returned fragment (after the ticker `<div>`):

```tsx
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
```

- [ ] **Step 4: Style the gear (`Header.module.css`)**

Append:

```css
.gear { background: transparent; border: 1px solid var(--border-2); color: var(--muted); font-size: 13px; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; line-height: 1; }
.gear:hover { color: var(--amber); border-color: var(--amber); }
```

- [ ] **Step 5: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live: click ⚙ → modal opens. Deposit $10,000 → Header **Balance** rises by $10k. Enter an amount and Withdraw → capital drops (capped at free margin). Reset account → Confirm → positions/pending/history/orders/alerts clear, capital unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SettingsModal.tsx frontend/src/components/SettingsModal.module.css frontend/src/components/Header.tsx frontend/src/components/Header.module.css
git commit -m "feat(account): settings modal (deposit/withdraw/reset) + header gear

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: OrderPanel margin-guard UI

**Files:**
- Modify: `frontend/src/components/OrderPanel.tsx`, `frontend/src/components/OrderPanel.module.css`

**Interfaces:**
- Consumes: `computeAccount` (Task 1), store `positions`/`history`/`assets`/`capital`.

- [ ] **Step 1: Import `computeAccount` and read account state (`OrderPanel.tsx`)**

Change the store import:

```ts
import { computeAccount, useStore } from '../store'
```

Add reads next to the existing `useStore` calls (after `const placePending = useStore((s) => s.placePending)`):

```ts
  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const allAssets = useStore((s) => s.assets)
  const capital = useStore((s) => s.capital)
```

- [ ] **Step 2: Compute the insufficiency flag (`OrderPanel.tsx`)**

After the early-return guard (`if (!asset || !book || price == null) { return … }`) and before `const submit`, add:

```ts
  const acct = computeAccount(positions, allAssets, history, capital)
  const insufficient = lots > 0 && margin > acct.free
```

- [ ] **Step 3: Show the inline error + disable the buttons (`OrderPanel.tsx`)**

Replace the actions block (the `<div className={styles.actions}>…</div>`) with an inline message above it and `disabled` buttons:

```tsx
        {insufficient && (
          <div className={styles.marginErr}>Insufficient free margin — need {fmtUsd(margin)}, have {fmtUsd(acct.free)}</div>
        )}

        <div className={styles.actions}>
          <button className={styles.buy} disabled={insufficient} onClick={() => submit('BUY')}>▲ BUY</button>
          <button className={styles.sell} disabled={insufficient} onClick={() => submit('SELL')}>▼ SELL</button>
        </div>
```

- [ ] **Step 4: Style the error + disabled buttons (`OrderPanel.module.css`)**

Append:

```css
.marginErr { color: var(--red); font: 700 10px/1.35 'JetBrains Mono', monospace; text-align: center; margin: 8px 0 2px; }
.buy:disabled, .sell:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }
```

- [ ] **Step 5: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live: set lots high enough that MARGIN > Free Margin → red inline message appears and BUY/SELL grey out. (The store guard also raises an `ERROR` toast if an order is submitted programmatically.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/OrderPanel.tsx frontend/src/components/OrderPanel.module.css
git commit -m "feat(account): block over-margined orders in the ticket (inline + disabled)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Clickable positions/pending rows

**Files:**
- Modify: `frontend/src/components/CenterPanel.tsx`, `frontend/src/components/CenterPanel.module.css`

**Interfaces:**
- Consumes: store `select` action (existing).

- [ ] **Step 1: Read `select` (`CenterPanel.tsx`)**

Add near the other `useStore` reads (after `const removeAlert = useStore((s) => s.removeAlert)`):

```ts
  const select = useStore((s) => s.select)
```

- [ ] **Step 2: Make POSITIONS rows clickable (`CenterPanel.tsx`)**

Change the positions `<tr>` opening tag and its ✕ button handler:

```tsx
                    <tr key={p.id} className={styles.clickRow} onClick={() => select(p.symbol)}>
```

```tsx
                      <td><button className={styles.close} title="Close" onClick={(e) => { e.stopPropagation(); closePosition(p.id) }}>✕</button></td>
```

- [ ] **Step 3: Make PENDING rows clickable (`CenterPanel.tsx`)**

Change the pending `<tr>` opening tag and its ✕ button handler:

```tsx
                    <tr key={o.id} className={styles.clickRow} onClick={() => select(o.symbol)}>
```

```tsx
                      <td><button className={styles.close} title="Cancel" onClick={(e) => { e.stopPropagation(); cancelPending(o.id) }}>✕</button></td>
```

- [ ] **Step 4: Style the clickable rows (`CenterPanel.module.css`)**

Append:

```css
.clickRow { cursor: pointer; }
.clickRow:hover td { background: rgba(96, 125, 139, .10); }
```

- [ ] **Step 5: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live: open positions on two symbols; click a POSITIONS row → the main chart switches to that symbol. Click a PENDING row → same. The ✕ still closes/cancels without switching the chart.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CenterPanel.tsx frontend/src/components/CenterPanel.module.css
git commit -m "feat(account): click a position/pending row to chart that symbol

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the features (`CLAUDE.md`)**

Append to the **Account** bullet under "Key behaviours":

```
A **⚙ Settings** modal (Header) adjusts capital — deposit/withdraw (withdrawal capped at free margin), persisted `apex.capital` — and **resets** the account (clears positions/pending/history/orders/alerts, keeps capital). `computeAccount` takes `capital` as its 4th arg (`balance = capital + realized`). Orders whose margin exceeds free margin are **blocked** (`openPosition`/`placePending` guard → `ERROR` toast; inline warning + disabled BUY/SELL in the ticket). Clicking a **POSITIONS or PENDING** row selects that symbol in the chart.
```

- [ ] **Step 2: Final build**

Run: `cd frontend && npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 3: Backend sanity (unchanged — confirm nothing regressed)**

Run: `cd backend && python -m pytest -q`
Expected: `35 passed`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(account): document settings, margin guard, clickable rows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Configurable capital, persisted `apex.capital` | Task 1 (state + LS) |
| Deposit / withdraw (withdraw capped at free margin) | Task 1 (actions), Task 2 (modal UI) |
| `computeAccount(…, capital)` → `balance = capital + realized` | Task 1 |
| Reset wipes positions/pending/history/orders/alerts, keeps capital | Task 1 (`resetAccount`), Task 2 (button + confirm) |
| Settings modal + Header gear | Task 2 |
| Margin guard blocks market & pending (strict) + `ERROR` toast | Task 1 (`openPosition`/`placePending`) |
| Inline red message + disabled BUY/SELL | Task 3 |
| `Notice` ERROR + `.kERROR` toast | Task 1 |
| Click positions + pending rows → chart | Task 4 |
| Docs | Task 5 |

**2. Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**3. Type consistency:** `computeAccount(positions, assets, history, capital = BALANCE)` defined in Task 1 and called with 4 args in Tasks 1 (store), 2 (modal/header), 3 (order panel). `deposit`/`withdraw`/`resetAccount`/`capital` names match between store (Task 1), modal (Task 2). `select` is an existing store action used in Task 4. `Notice.kind` `'ERROR'` (Task 1) matches the `kind: 'ERROR' as const` in the store guards (Task 1) and `.kERROR` CSS (Task 1). ✓
