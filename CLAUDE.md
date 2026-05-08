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
- **`inert` + `aria-hidden="true"` on every non-current panel**: Cleared on the current panel. Prevents focus traps (tab can't escape into a panel sliding off-screen) and prevents screen readers from announcing hidden content. The CSS still uses `pointer-events: none` as a belt-and-suspenders for older browsers.
- **Declarative triggers via a single delegated click listener**: `data-action-stack-push` / `data-action-stack-pop` are handled by one click handler on the `<panel-stack>` host (uses `event.target.closest()` and `_.contains()` to scope to descendants). Cheaper than per-button binding and works for buttons added after mount.
- **`customElements.get()` guard around both `define()` calls**: Safe across multi-import scenarios (e.g., the same package loaded from a CDN script and an ESM import) — second `define()` would otherwise throw.
- **`border-radius: inherit` on both elements**: A wrapper with `border-radius` + `overflow: hidden` rounds the panels automatically. No `--ps-radius` needed.
- **`prefers-reduced-motion` honored in the CSS layer**: Transitions collapse to `none` for users who request reduced motion — handled in `src/panel-stack.css`, not JS.
- **Per-state CSS custom properties (translate / scale-x / scale-y / blur / opacity / brightness / z-index)**: Each state (`current` / `previous` / `next`) gets its own value for each axis. Override one state without touching the others. The `effect="stack"` selector overrides only the `previous` defaults.
- **Cancelable before-events**: `panel-stack:push` and `panel-stack:pop` are dispatched before the state mutation. Calling `event.preventDefault()` aborts the navigation. `panel-stack:reset` is not cancelable (it's a recovery action).
- **Initial panel resolution is forgiving**: `initial="x"` falls back to the first child if `x` doesn't match a `handle` — never throws or no-ops on mount.

## Elements

| Element | Class | Description |
|---|---|---|
| `<panel-stack>` | `PanelStack` | Root container. Owns the navigation stack + event lifecycle. |
| `<stack-panel>` | `StackPanel` | Single panel slot. Driven by its `[state]` attribute. |

## Attributes (author-provided)

| Attribute | On | Default | Description |
|---|---|---|---|
| `initial` | `<panel-stack>` | first child | Handle of the panel to show on mount. Falls back to first child if invalid. |
| `effect` | `<panel-stack>` | `slide` (implicit) | Visual style for `previous` panels. `slide` = off to the left; `stack` = shrinks + dims behind current. |
| `handle` | `<stack-panel>` | required | Identifier used by `push()` / `pop()` / declarative triggers. |

## Attributes (set by the component)

These are the public styling hooks. Consumers can target them via `stack-panel[state="current"]`, etc.

| Attribute | On | When it's set | Purpose |
|---|---|---|---|
| `state` | `<stack-panel>` | always | One of `current`, `previous`, `next`. CSS uses it to position and animate the panel. |
| `inert` | `<stack-panel>` | when not `current` | Removes the panel from focus order and pointer events. |
| `aria-hidden` | `<stack-panel>` | always | `false` on `current`, `true` otherwise. |
| `role` | `<stack-panel>` | on connect | Set to `group` if not already specified by the author. |

## Events

All events bubble and are composed (cross shadow DOM boundaries).

| Event | Detail | Cancelable | Description |
|---|---|---|---|
| `panel-stack:push` | `{ fromHandle, toHandle }` | yes | Dispatched before `push()` mutates state. `preventDefault()` aborts the navigation. `fromHandle` is `null` only if `push()` is called before any panel is current. |
| `panel-stack:pop` | `{ fromHandle, toHandle }` | yes | Dispatched before `pop()` mutates state. `preventDefault()` aborts. |
| `panel-stack:reset` | `{ rootHandle }` | no | Dispatched after `reset()` collapses the stack to root. |

## Public API

- `stack.push(handle)` → `boolean`. `false` if the handle isn't found, equals the current handle, or the event was cancelled.
- `stack.pop()` → `boolean`. `false` if at root or the event was cancelled.
- `stack.reset()` → `void`. Collapses to root. Sets every non-root panel to `next`.
- `stack.currentHandle` (getter) → `string | null`.
- `stack.currentPanel` (getter) → `StackPanel | null`.
- `stack.depth` (getter) → `number`. Root counts as 1.

`StackPanel.focus(options)` is overridden to delegate to `[data-stack-focus]` first, then the first focusable descendant (`button`, `a[href]`, `input`, `select`, `textarea`, `[tabindex]:not([tabindex="-1"])`).

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
| `--ps-opacity-{state}` | `1` · `0.3` · `0.3` |
| `--ps-brightness-{state}` | `1` · `1` · `1` |
| `--ps-z-index-{state}` | `1` · `0` · `2` |

`effect="stack"` overrides the `previous` defaults to: translate `0%`, scale `0.95`, blur `1px`, opacity `1`, brightness `0.8`, z-index `-1`.

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

No test suite. Use `npm run dev` and the `demo/index.html` page for manual testing — push/pop, double-pop, the `effect="stack"` styling, the `cancel a push` pattern, and tabbing into hidden panels (should be blocked by `inert`).
