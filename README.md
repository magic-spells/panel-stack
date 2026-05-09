# @magic-spells/panel-stack

A nested-panel stack web component with fluid push/pop transitions. Built for mobile menus, settings drill-downs, multi-step wizards, and anything that wants the feel of a navigation stack.

🔍 **[Live Demo](https://magic-spells.github.io/panel-stack/demo/)** — See it in action!

- **1.27 KB JS gzip**, 0.77 KB CSS gzip, zero dependencies
- Two custom elements: `<panel-stack>` + `<stack-panel>`
- Honors `prefers-reduced-motion`
- `inert` on hidden panels — focus stays where it should
- All motion tunable via CSS custom properties

## Install

```bash
npm i @magic-spells/panel-stack
```

```js
import '@magic-spells/panel-stack';
```

```html
<link rel="stylesheet" href="https://unpkg.com/@magic-spells/panel-stack/css/min" />
```

## Markup

```html
<panel-stack initial="root">
  <stack-panel handle="root">
    <button data-action-stack-push target="shop">Shop</button>
    <a href="/about">About</a>
  </stack-panel>

  <stack-panel handle="shop">
    <button data-action-stack-pop>Back</button>
    <button data-action-stack-push target="shop-women">Women</button>
  </stack-panel>

  <stack-panel handle="shop-women">
    <button data-action-stack-pop>Back</button>
    <a href="/dresses">Dresses</a>
  </stack-panel>
</panel-stack>
```

The parent of `<panel-stack>` needs a defined size — panels are `position: absolute; inset: 0` and the stack clips them.

## API

```js
const stack = document.querySelector('panel-stack');

stack.push('shop');              // slide to a panel
stack.push('shop', triggerEl);   // optional 2nd arg — pop() restores focus to it
stack.pop();                     // back one level
stack.reset();                   // collapse to root

stack.currentHandle;   // 'shop'
stack.currentPanel;    // <stack-panel handle="shop">
stack.depth;           // 2
```

## Events

All bubble + composed; the before-events are cancelable.

```js
stack.addEventListener('panel-stack:push', (e) => {
  console.log(e.detail); // { fromHandle: 'root', toHandle: 'shop' }
});

stack.addEventListener('panel-stack:pop', (e) => { /* { fromHandle, toHandle } */ });
stack.addEventListener('panel-stack:reset', (e) => { /* { rootHandle } */ });

// Cancel a push:
stack.addEventListener('panel-stack:push', (e) => {
  if (e.detail.toHandle === 'admin' && !user.isAdmin) e.preventDefault();
});
```

## Effects

Two visual styles for how `state="previous"` panels look. Pick one with the `effect` attribute:

```html
<panel-stack effect="slide"> … </panel-stack>   <!-- default: slides off to the left -->
<panel-stack effect="stack"> … </panel-stack>   <!-- shrinks + blurs + dims behind current -->
```

`effect="stack"` keeps the previous panel in place while it scales to `0.95`, blurs `1px`, dims to `brightness(0.5)`, and drops to `z-index: -1` behind the current panel. Pop, and it pops back to full size, sharp, and bright.

Both effects share the same per-state CSS variables, so you can fine-tune either one.

## Rounded corners

`<panel-stack>` and `<stack-panel>` use `border-radius: inherit`. Wrap the stack in a container with a radius and the panels pick it up automatically:

```html
<div style="border-radius: 22px; overflow: hidden; width: 320px; height: 540px;">
  <panel-stack effect="stack"> … </panel-stack>
</div>
```

## CSS custom properties

Global timing and perspective:

| Property | Default | Description |
| --- | --- | --- |
| `--ps-transition-duration` | `420ms` | Animation duration (transform + filter) |
| `--ps-transition-timing` | `cubic-bezier(0.16, 0.87, 0.64, 1)` | Easing |
| `--ps-perspective` | `1200px` | Depth of the 3D scene |

Per-state position and filter values. Each state has its own translate, scale, blur, opacity, brightness, and z-index — override one state without affecting the others:

| Property | Default (current · previous · next) |
| --- | --- |
| `--ps-translate-{state}` | `0%` · `calc(-100% - 50px)` · `calc(100% + 50px)` |
| `--ps-scale-x-{state}` | `1` · `1.1` · `1.1` |
| `--ps-scale-y-{state}` | `1` · `1` · `1` |
| `--ps-blur-{state}` | `0px` · `2px` · `2px` |
| `--ps-opacity-{state}` | `1` · `0.1` · `0.1` |
| `--ps-z-index-{state}` | `1` · `0` · `2` |

`--ps-brightness-previous` (default `1`) is the only brightness knob — `effect="stack"` uses it to darken the receding panel.

`--ps-scale-x-{state}` and `--ps-scale-y-{state}` accept any number — values < 1 shrink the panel, values > 1 stretch it, negative values flip it (mirror).

`effect="stack"` overrides the `previous` defaults to: translate `0%`, scale `0.95`, blur `1px`, opacity `1`, brightness `0.5`, z-index `-1`. It also sets `--ps-opacity-next: 1` so panels coming in from the right aren't faded during the swap.

Example — make the slide flat (no scale, no blur):

```css
panel-stack {
  --ps-scale-x-previous: 1;
  --ps-scale-x-next: 1;
  --ps-blur-previous: 0px;
  --ps-blur-next: 0px;
}
```

## Focus

On `push()` and `reset()`, focus moves to the new current panel — specifically:

1. The first descendant with `data-stack-focus`, if one exists
2. Otherwise the first focusable child (button, link, input, etc.)

On `pop()`, focus is restored to the element that originally pushed the panel you're leaving — matching native back-button behavior. Declarative `data-action-stack-push` triggers are remembered automatically; for programmatic pushes pass the trigger as the second arg: `stack.push('shop', triggerEl)`. If the trigger has been removed from the DOM, pop falls back to the destination panel's first focusable.

Inactive panels get `inert` so they can't trap tab navigation or screen reader focus.

## Keyboard

Pressing **Escape** while focus is inside the stack pops one level — but only when there's somewhere to go back to. At the root panel, Esc bubbles untouched so a wrapping `<dialog>` closes as normal:

```html
<dialog>
  <panel-stack>
    <stack-panel handle="root">…</stack-panel>
    <stack-panel handle="settings">…</stack-panel>
  </panel-stack>
</dialog>
```

Drill into `settings`, hit Esc → goes back to `root`, dialog stays open. Hit Esc again → dialog closes. No coordination needed between the two.

If a focused input already consumed Esc (e.g., `<input type="search">` clearing its value), the stack stays put. Wizards with unsaved work can cancel the pop via `panel-stack:pop`'s `preventDefault()`.

## License

MIT

---

<p align="center">
  Made by <a href="https://github.com/coryschulz">Cory Schulz</a>
</p>
