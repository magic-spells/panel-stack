# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run build` — Production build (Vite library mode + lightningcss). Wipes and rebuilds `dist/` with the ESM bundle, the minified UMD-style bundle, and both unminified + minified CSS, plus sourcemaps.
- `npm run dev` — Vite dev server on `localhost:3000`. Auto-opens `/demo/`. A custom middleware rewrites requests for `dist/panel-stack.*` to the live `src/` files, so HMR works without a build.
- `npm run lint` — ESLint over `src/` and `scripts/`.
- `npm run format` — Prettier write across the repo.
- `prepublishOnly` runs `npm run build` automatically on `npm publish`.

## Code Style Guidelines
- **File Structure**: All component logic in `src/panel-stack.js`, styles in `src/panel-stack.css`. Two custom elements live in the same file because they're tightly coupled. No `src/components/` subfolder — flat layout.
- **Exports**: `src/panel-stack.js` is the single entry. It imports the CSS, defines both classes, registers both tags via `customElements.define()` (guarded with `customElements.get()`), and named-exports `PanelStack` + `StackPanel`.
- **JavaScript**: Private class fields with `#` prefix for all internal state. The `const _ = this;` alias inside methods is intentional — keeps line width down for the call-heavy methods. JSDoc on all public methods and getters.
- **Formatting**: Tabs (width 2), single quotes, semicolons, trailing commas (es5), `printWidth: 100`, `bracketSameLine: true`. Driven by `.prettierrc`.
- **Naming**: Kebab-case for custom element tags (`panel-stack`, `stack-panel`); PascalCase for classes (`PanelStack`, `StackPanel`); camelCase for methods/properties; kebab-case for `data-*` and CSS custom properties (`--ps-*`).

## Design Decisions
- **Two elements, one source file**: `<panel-stack>` owns the navigation state and event lifecycle. `<stack-panel>` is a passive slot driven entirely by the `[state]` attribute its parent sets. Splitting them across files would force the lifecycle to communicate through events instead of direct calls — not worth the indirection for ~250 lines.
- **State stored as a stack array, not a single pointer**: `#stack = ['root', 'shop', 'shop-women']`. `pop()` returns to the prior `push()`, not just to the previous panel. This is what makes "back through three levels" work without the consumer tracking history.
- **All animation lives in CSS**: JS only toggles the `[state]` attribute on each `<stack-panel>` between `current` / `previous` / `next`. Adding a new visual effect = pure CSS. No keyframes, no JS animation loop, no requestAnimationFrame in the component.
- **`effect="stack"` is a CSS attribute selector, not a JS branch**: Switching effects costs nothing at runtime. Authors can add their own effects by writing `panel-stack[effect="my-style"] stack-panel[state="previous"] { … }`.
- **`inert` (alone) on every non-current panel**: Cleared on the current panel. `inert` already removes the subtree from focus order AND from the accessibility tree, so adding `aria-hidden` on top is redundant — and worse, Chrome warns "Blocked aria-hidden because descendant retained focus" when the aria-hidden write races the focus handoff. Inert is the right primitive here. The CSS still uses `pointer-events: none` per state as a belt-and-suspenders.
- **Declarative triggers via a single delegated click listener**: `data-action-stack-push` / `data-action-stack-pop` are handled by one click handler on the `<panel-stack>` host (uses `event.target.closest()` and `_.contains()` to scope to descendants). Cheaper than per-button binding and works for buttons added after mount.
- **`customElements.get()` guard around both `define()` calls**: Safe across multi-import scenarios (e.g., the same package loaded from a CDN script and an ESM import) — second `define()` would otherwise throw.
- **`border-radius: inherit` on both elements**: A wrapper with `border-radius` + `overflow: hidden` rounds the panels automatically. No `--ps-radius` needed.
- **`prefers-reduced-motion` honored in the CSS layer**: Transitions collapse to `none` for users who request reduced motion — handled in `src/panel-stack.css`, not JS.
- **Per-state CSS custom properties (translate / scale-x / scale-y / blur / opacity / z-index)**: Each state (`current` / `previous` / `next`) gets its own value for each axis. Override one state without touching the others. Brightness is the exception — only `--ps-brightness-previous` exists, since dimming the current or next panel isn't part of any stock effect. `effect="stack"` overrides the `previous` defaults plus `--ps-opacity-next` (so incoming-from-right panels stay opaque while the receding panel is darkened in place).
- **Cancelable before-events**: `panel-stack:push` is dispatched before the state mutation; calling `event.preventDefault()` aborts the navigation. `panel-stack:pop` and `panel-stack:reset` are not cancelable.
- **`current` is the one observed attribute; everything else is read at connect**: `observedAttributes = ['current']`. A write resolves against the stack — already current → no-op; the root handle → `reset()`; a handle already in the stack → `pop()` per level (so a three-level jump back fires three `panel-stack:pop` events, each with its own `{ fromHandle, toHandle }`, and each animates); anything else known → `push()` (still cancelable). An unknown handle, a cancelled push, and a removed attribute all end in `#reflect()`, which writes the real current handle back — the attribute never lies. `#reflecting` guards the write so the component's own reflection doesn't re-enter `attributeChangedCallback` as a navigation, and `attributeChangedCallback` bails until `#initialized`, because the callback fires before `connectedCallback` on upgrade and the panels aren't indexed yet.
- **Reflection is unconditional**: `current` is written after every `push()` / `pop()` / `reset()` and once at init, whether or not the author ever used the attribute. That's the price of making it trustworthy for a controlling parent — the only 0.1.0 behavior change is that a stack now always carries a `current` attribute in the DOM.
- **An authored `current` seeds the stack as `[root, current]`, not as the root**: `initial` still names the root, so `pop()` and Escape go back from a deep-linked start instead of dead-ending. No event fires for the seeding.
- **Child changes are re-indexed by a childList `MutationObserver`, plus a scan-on-demand in `push()`**: the observer is async (microtask), so `appendChild(panel); stack.push('new')` in the same tick would miss it — `push()` re-scans when the handle isn't in the map, which covers the synchronous case at zero cost for the common one. The observer is `childList` only (not `subtree`): panel *contents* change constantly and are none of the component's business. Removing a panel prunes its frame from `#stack`, so a removed current panel falls back to the nearest surviving ancestor (states recomputed from the pruned stack, focus moved into the new current). That's a DOM correction, not a navigation — no `push`/`pop` event fires, only the reflected attribute changes.
- **Initial panel resolution is forgiving**: `initial="x"` falls back to the first child if `x` doesn't match a `handle` — never throws or no-ops on mount.
- **Focus moves before the outgoing panel becomes inert**: `push()` / `pop()` / `reset()` set the incoming panel to `current`, update `#stack` so `currentPanel` points at the focus fallback, call `#focus()`, then mark the outgoing panel `inert`. If focus moves after inert is applied, the still-focused trigger button gets stranded in an inert subtree and the browser tries to scroll it back into view — which on a `panel-stack` (overflow: hidden + absolutely-positioned panels) silently shifts the host's nearest scrollable ancestor and breaks the layout. `focus({ preventScroll: true })` is the safety net for the same reason: even with the right order, browsers may attempt scroll-into-view, and `preventScroll` blocks it.
- **Each push frame stores `{ handle, trigger }`**: `pop()` restores focus to the trigger element that opened the panel being popped — matching native back-button UX (browser, iOS UINavigationController). The trigger lives in the destination panel by construction, since that's where the user clicked it. `#focus(preferred)` falls back to `currentPanel.focus()` when the preferred element isn't connected (removed from the DOM, or push was called programmatically without a trigger), so there's no try/catch and no silent stranding. `push()` and `reset()` always go through the panel-focus fallback (no trigger to restore to).
- **Escape pops one level when `depth > 1`; at root the event bubbles untouched**: This composes correctly with native `<dialog>` and any ancestor Esc handler — drilling three levels deep into a panel-stack inside a dialog, hitting Esc once steps back one level (dialog stays open); at root, Esc closes the dialog as normal. No coordination required between the two. The handler is bound on the host (not on `document`), so Esc only navigates the stack when focus is inside the stack. Bails on `event.defaultPrevented` so inputs that consumed Esc first (search clearing, combobox closing) keep working.

## Elements

| Element | Class | Description |
|---|---|---|
| `<panel-stack>` | `PanelStack` | Root container. Owns the navigation stack + event lifecycle. |
| `<stack-panel>` | `StackPanel` | Single panel slot. Driven by its `[state]` attribute. |

## Attributes (author-provided)

| Attribute | On | Default | Description |
|---|---|---|---|
| `initial` | `<panel-stack>` | first child | Handle of the panel to show on mount. Falls back to first child if invalid. |
| `current` | `<panel-stack>` | — | Controlled: handle of the panel that should be current. Observed — writing it navigates. The component reflects it back after every navigation, so it doubles as a read hook. Authored at first connect it starts the stack on that panel (root underneath, no events). |
| `effect` | `<panel-stack>` | `slide` (implicit) | Visual style for `previous` panels. `slide` = off to the left; `stack` = shrinks + dims behind current. |
| `handle` | `<stack-panel>` | required | Identifier used by `push()` / `pop()` / declarative triggers. |

## Attributes (set by the component)

These are the public styling hooks. Consumers can target them via `stack-panel[state="current"]`, etc.

| Attribute | On | When it's set | Purpose |
|---|---|---|---|
| `state` | `<stack-panel>` | always | One of `current`, `previous`, `next`. CSS uses it to position and animate the panel. |
| `inert` | `<stack-panel>` | when not `current` | Removes the panel from focus order, pointer events, and the accessibility tree. |
| `role` | `<stack-panel>` | on connect | Set to `group` if not already specified by the author. |
| `current` | `<panel-stack>` | after every push / pop / reset, and on init | Reflected value of `currentHandle`. Written with an internal guard so the reflection doesn't loop back through `attributeChangedCallback`. |

## Events

All events bubble and are composed (cross shadow DOM boundaries).

| Event | Detail | Cancelable | Description |
|---|---|---|---|
| `panel-stack:push` | `{ fromHandle, toHandle }` | yes | Dispatched before `push()` mutates state. `preventDefault()` aborts the navigation. `fromHandle` is `null` only if `push()` is called before any panel is current. |
| `panel-stack:pop` | `{ fromHandle, toHandle }` | no | Dispatched before `pop()` mutates state. |
| `panel-stack:reset` | `{ rootHandle }` | no | Dispatched after `reset()` collapses the stack to root. |

## Public API

- `stack.push(handle, trigger?)` → `boolean`. `false` if the handle isn't found, equals the current handle, or the event was cancelled. `trigger` is optional; when provided, `pop()` will restore focus to it. Declarative `data-action-stack-push` clicks pass the button automatically.
- `stack.pop()` → `boolean`. `false` if at root.
- `stack.reset()` → `void`. Collapses to root. Sets every non-root panel to `next`.
- `stack.current` (getter/setter) → `string | null`. Reads `currentHandle`; writing it sets the `current` attribute, i.e. navigates with the controlled-mode semantics below. `currentHandle` stays as the read-only alias for back-compat.
- `stack.currentHandle` (getter) → `string | null`.
- `stack.currentPanel` (getter) → `StackPanel | null`.
- `stack.depth` (getter) → `number`. Root counts as 1.

`StackPanel.focus(options)` is overridden to delegate to `[data-stack-focus]` first, then the first focusable descendant (`button`, `a[href]`, `input`, `select`, `textarea`, `[tabindex]:not([tabindex="-1"])`). After every `push()` / `pop()` / `reset()`, `PanelStack` calls `#focus()` with `{ preventScroll: true }`. On `pop()` it prefers the trigger that opened the popped panel; on `push()` and `reset()` it focuses the new current panel. When the preferred trigger has been removed from the DOM, focus falls through to `currentPanel.focus()`. If the current panel has no focusable descendant either, focus stays where it was — the previously-focused element is then dropped onto the floor when its panel becomes inert (the browser moves focus to `<body>`).

Setting `current` (attribute or property) navigates: no-op if already current, `reset()` for the root handle, one `pop()` per level for an ancestor, `push()` otherwise. Unknown handles, cancelled pushes, and attribute removal restore the reflected value.

Escape (when focused inside the stack) calls `pop()` while `depth > 1` and consumes the keydown. At root, Esc bubbles untouched so a wrapping `<dialog>` closes as normal.

## CSS Custom Properties

Defined on the `:root` of `src/panel-stack.css`. All consumer-overridable.

### Global timing & perspective

| Variable | Default | Description |
|---|---|---|
| `--ps-transition-duration` | `420ms` | Animation duration (transform + filter). |
| `--ps-transition-timing` | `cubic-bezier(0.16, 0.87, 0.64, 1)` | Easing curve. |
| `--ps-perspective` | `1200px` | Depth of the 3D scene on `<panel-stack>`. |

### Per-state position & filter (`{state}` ∈ `current` / `previous` / `next`)

| Variable | Default (current · previous · next) |
|---|---|
| `--ps-translate-{state}` | `0%` · `calc(-100% - 50px)` · `calc(100% + 50px)` |
| `--ps-scale-x-{state}` | `1` · `1.1` · `1.1` |
| `--ps-scale-y-{state}` | `1` · `1` · `1` |
| `--ps-blur-{state}` | `0px` · `2px` · `2px` |
| `--ps-opacity-{state}` | `1` · `0.1` · `0.1` |
| `--ps-z-index-{state}` | `1` · `0` · `2` |

`--ps-brightness-previous` exists separately (default `1`) and is the only brightness knob — `effect="stack"` overrides it to `0.5` to darken the receding panel. There's no brightness on `current` or `next` because nothing in the design dims them.

`effect="stack"` overrides the `previous` defaults to: translate `0%`, scale `0.95`, blur `1px`, opacity `1`, brightness `0.5`, z-index `-1`. It also sets `--ps-opacity-next: 1`.

## Example Structure

```html
<panel-stack initial="root" effect="stack">
  <stack-panel handle="root">
    <button data-action-stack-push target="shop">Shop</button>
    <a href="/about">About</a>
  </stack-panel>

  <stack-panel handle="shop">
    <button data-action-stack-pop>Back</button>
    <button data-action-stack-push target="shop-women">Women</button>
  </stack-panel>

  <stack-panel handle="shop-women">
    <button data-action-stack-pop data-stack-focus>Back</button>
    <a href="/dresses">Dresses</a>
  </stack-panel>
</panel-stack>
```

## Testing

No test suite. Use `npm run dev` and the `demo/index.html` page for manual testing — push/pop, double-pop, the `effect="stack"` styling, the `cancel a push` pattern, and tabbing into hidden panels (should be blocked by `inert`). The `Controlled` demo section covers the `current` attribute end to end: deeper push, pop back to an ancestor, reset to root, unknown handle, cancelled push, and a panel added at runtime.
