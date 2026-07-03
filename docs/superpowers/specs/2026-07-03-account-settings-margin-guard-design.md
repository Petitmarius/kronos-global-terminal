# Account Settings, Margin Guard & Clickable Positions — Design

- **Date:** 2026-07-03
- **Proposed branch:** `feat/account-settings`
- **Status:** Design approved, pending spec review

## 1. Problem / goal

Three account/terminal-UX features:

1. **Settings panel** — reset the account and adjust the starting capital.
2. **Margin guard** — block an order (and message the user) when its required
   margin exceeds available free margin.
3. **Click a position/pending row** → select that symbol so the main chart shows it.

## 2. Decisions (from brainstorming)

| Point | Decision |
|---|---|
| Reset scope | Wipe **everything** — positions, pending, trade log, order history, **and alerts** — keep the configured capital |
| Capital model | **Deposit / withdraw** (additive); deposits accumulate, withdrawals capped at free margin |
| Margin over free | **Block** the order (market **and** pending) + message |
| Click scope | **Positions + pending** rows |
| Where | Entirely **frontend** (Zustand store + components); no backend |

## 3. Architecture

All state lives in the Zustand store. The current fixed `BALANCE = 50_000`
constant becomes a persisted, adjustable `capital`. A `SettingsModal` (opened by
a gear in the Header) drives deposit/withdraw/reset. `computeAccount` takes
`capital` as a parameter. The margin guard lives authoritatively in the store
actions (`openPosition`/`placePending`) and is surfaced in `OrderPanel`.

## 4. Store (`store.ts`)

- New state `capital: number`, persisted under `apex.capital` (default `BALANCE`).
- `computeAccount(positions, assets, history, capital = BALANCE)` — `balance = capital + realizedAll`
  (replaces the hard-coded `BALANCE`). The default keeps existing call sites valid.
- New actions:
  - `deposit(amount: number)` — `capital += max(0, amount)`; persist.
  - `withdraw(amount: number)` — cap at current free margin:
    `const free = computeAccount(s.positions, s.assets, s.history, s.capital).free; const w = Math.min(Math.max(0, amount), free); capital -= w`; persist.
  - `resetAccount()` — set `positions/pending/history/orders/alerts` to `[]` and
    `notices` to `[]`; `persistSim` the empty state; **keep `capital`**.
- **Margin guard** in `openPosition(p)` and `placePending(o)`: compute
  `free = computeAccount(s.positions, s.assets, s.history, s.capital).free`; if the
  order's `margin > free`, do **not** add it — push an `ERROR` notice
  (`Order blocked — margin ${fmtUsd(margin)} exceeds free ${fmtUsd(free)}`) and return.
  (Pending **fills** in `applyQuotes` are not re-checked — placement is the guard point.)
- Import `fmtUsd` from `./format` for the message.

## 5. `SettingsModal.tsx` (new) + `SettingsModal.module.css` (new)

A centered overlay (fixed, backdrop) reading the store directly. Props: `onClose`.

- **Capital** section: shows current `capital` (`fmtUsd`). An amount input +
  **DEPOSIT** and **WITHDRAW** buttons. Withdraw is disabled/clamped to the current
  free margin (shown as “max $X”). Invalid/zero amounts are ignored.
- **Reset account** section: a `Reset account` button that flips to a two-step
  confirm (`Confirm reset` / `Cancel`) before calling `resetAccount()`; then closes.
- Close button (✕) and backdrop click close the modal.

## 6. Header (`Header.tsx`)

- Read `capital` from the store; call `computeAccount(positions, assets, history, capital)`.
- Add a gear button (⚙) in the `.net` status area with a local `settingsOpen`
  state; render `{settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}`.

## 7. Order margin guard UI (`OrderPanel.tsx`)

- Read `positions`, `history`, `assets`, `capital`; compute
  `const acct = computeAccount(positions, assets, history, capital)` and
  `const insufficient = lots > 0 && margin > acct.free`.
- When `insufficient`: render a red inline message under the RISK row
  (`Insufficient free margin (need ${fmtUsd(margin)}, have ${fmtUsd(acct.free)})`) and
  set `disabled` on both BUY and SELL buttons (styled as disabled).
- The store guard (§4) remains the authoritative block and the `ERROR` toast source.

## 8. Clickable rows (`CenterPanel.tsx`)

- POSITIONS `<tr>` and PENDING `<tr>` get `onClick={() => select(p.symbol)}`
  (read `select` from the store), a pointer cursor, and a hover highlight.
- The row’s ✕ button handler calls `e.stopPropagation()` so closing/cancelling does
  not also switch the chart.

## 9. Toast `ERROR` type

- `types.ts`: extend `Notice.kind` to `'SL' | 'TP' | 'ALERT' | 'TRADE' | 'ERROR'`.
- `Toasts.module.css`: add a `.kERROR` rule (red accent, consistent with `.kSL`).

## 10. Edge cases

- **Withdraw** never drives free margin negative (capped at `acct.free`); withdrawing
  with open positions only releases uncommitted cash.
- **Capital below committed margin**: cannot happen via withdraw (cap); deposits only add.
- **Reset** keeps `capital` (a deposit history is not tracked — capital is a single number).
- **Guard equality**: an order is allowed when `margin === free` (blocked only if strictly greater).
- **Old persisted state**: `capital` defaults to `BALANCE` when `apex.capital` is absent.

## 11. Files

- **New:** `frontend/src/components/SettingsModal.tsx`, `frontend/src/components/SettingsModal.module.css`.
- **Modify:** `frontend/src/store.ts` (capital, deposit/withdraw/resetAccount, guard, `computeAccount` param),
  `frontend/src/components/Header.tsx` (gear + modal + capital), `frontend/src/components/OrderPanel.tsx`
  (margin guard UI), `frontend/src/components/CenterPanel.tsx` (clickable rows),
  `frontend/src/types.ts` (`Notice` ERROR), `frontend/src/components/Toasts.module.css` (`.kERROR`).
- **Backend:** none.

## 12. Verification

- `cd frontend && npm run build` green.
- Live: open ⚙ → deposit $10k (Balance rises), withdraw (capped at free). Reset →
  everything clears, capital kept. Set lots so margin > free → red inline message +
  disabled BUY/SELL; forcing it (store) yields an `ERROR` toast. Click a position and a
  pending row → the main chart switches to that symbol; the ✕ still closes/cancels.

## 13. Out of scope (future)

- Deposit/withdrawal ledger/history.
- Configurable leverage or per-symbol margin.
- Persisting the settings modal open state.
