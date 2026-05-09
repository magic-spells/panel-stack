//#region src/panel-stack.js
/**
* <panel-stack> — a navigation-stack web component.
*
* Manages a stack of <stack-panel> children where one is `current` and the
* rest are pushed off-screen as `previous` (left) or `next` (right). Calling
* push() slides the current panel out and a target panel in; pop() reverses
* to the prior entry on the stack.
*
* Markup:
*   <panel-stack initial="root">
*     <stack-panel handle="root">…</stack-panel>
*     <stack-panel handle="shop">…</stack-panel>
*   </panel-stack>
*
* Declarative triggers (handled via delegated click listener):
*   <button data-action-stack-push target="shop">Open shop</button>
*   <button data-action-stack-pop>Back</button>
*
* Programmatic API:
*   stack.push('shop')                 — focus moves to first focusable in shop
*   stack.push('shop', triggerEl)      — pop() will restore focus to triggerEl
*   stack.pop()
*   stack.reset()
*
* Events (all bubble + composed):
*   panel-stack:push   → detail { fromHandle, toHandle }   cancelable
*   panel-stack:pop    → detail { fromHandle, toHandle }   cancelable
*   panel-stack:reset  → detail { rootHandle }
*
* Keyboard:
*   Escape pops one level when depth > 1. At root the keydown bubbles
*   untouched, so a wrapping <dialog> (or any ancestor Esc handler) closes
*   naturally.
*/
var PanelStack = class extends HTMLElement {
	#stack = [];
	#panels = /* @__PURE__ */ new Map();
	#initialized = false;
	#handlers = {
		click: null,
		keydown: null
	};
	connectedCallback() {
		const _ = this;
		if (_.#initialized) return;
		_.#initialized = true;
		_.#queryDOM();
		_.#initState();
		_.#attachListeners();
	}
	disconnectedCallback() {
		const _ = this;
		if (_.#handlers.click) {
			_.removeEventListener("click", _.#handlers.click);
			_.#handlers.click = null;
		}
		if (_.#handlers.keydown) {
			_.removeEventListener("keydown", _.#handlers.keydown);
			_.#handlers.keydown = null;
		}
	}
	/**
	* Push a panel onto the stack.
	* @param {string} handle — handle of the target <stack-panel>
	* @param {Element|null} [trigger] — element that initiated the push. If
	*   provided, pop() will restore focus to it. Declarative triggers
	*   (data-action-stack-push) pass this automatically.
	* @returns {boolean} false if cancelled or invalid, true otherwise
	*/
	push(handle, trigger = null) {
		const _ = this;
		const target = _.#panels.get(handle);
		if (!target) return false;
		const fromHandle = _.currentHandle;
		if (fromHandle === handle) return false;
		if (!_.#emit("push", {
			fromHandle,
			toHandle: handle,
			cancelable: true
		})) return false;
		const fromPanel = _.#panels.get(fromHandle);
		_.#setPanelState(target, "current");
		_.#focus();
		_.#setPanelState(fromPanel, "previous");
		_.#stack.push({
			handle,
			trigger
		});
		return true;
	}
	/**
	* Pop the top panel off the stack.
	* @returns {boolean} false if at root or cancelled, true otherwise
	*/
	pop() {
		const _ = this;
		if (_.#stack.length <= 1) return false;
		const popped = _.#stack[_.#stack.length - 1];
		const dest = _.#stack[_.#stack.length - 2];
		if (!_.#emit("pop", {
			fromHandle: popped.handle,
			toHandle: dest.handle,
			cancelable: true
		})) return false;
		const fromPanel = _.#panels.get(popped.handle);
		const toPanel = _.#panels.get(dest.handle);
		_.#setPanelState(toPanel, "current");
		_.#focus(popped.trigger);
		_.#setPanelState(fromPanel, "next");
		_.#stack.pop();
		return true;
	}
	/**
	* Collapse the stack back to the root panel. All non-root panels return to
	* the `next` (off-screen right) state. No animation event fires for the
	* intermediate panels — only `panel-stack:reset`.
	*/
	reset() {
		const _ = this;
		if (_.#stack.length === 0) return;
		const root = _.#stack[0];
		_.#stack = [root];
		const rootPanel = _.#panels.get(root.handle);
		_.#setPanelState(rootPanel, "current");
		_.#focus();
		for (const [handle, panel] of _.#panels) if (handle !== root.handle) _.#setPanelState(panel, "next");
		_.#emit("reset", { rootHandle: root.handle });
	}
	/** Read-only: handle of the panel currently on top of the stack. */
	get currentHandle() {
		return this.#stack[this.#stack.length - 1]?.handle ?? null;
	}
	/** Read-only: the <stack-panel> element currently visible. */
	get currentPanel() {
		return this.#panels.get(this.currentHandle) ?? null;
	}
	/** Read-only: number of panels in the stack (root counts as 1). */
	get depth() {
		return this.#stack.length;
	}
	#queryDOM() {
		const _ = this;
		_.#panels.clear();
		const children = _.querySelectorAll(":scope > stack-panel");
		for (const panel of children) {
			const handle = panel.getAttribute("handle");
			if (!handle) {
				console.warn("<stack-panel> is missing a `handle` attribute", panel);
				continue;
			}
			_.#panels.set(handle, panel);
		}
	}
	#initState() {
		const _ = this;
		if (_.#panels.size === 0) return;
		const requested = _.getAttribute("initial");
		const rootHandle = requested && _.#panels.has(requested) ? requested : _.#panels.keys().next().value;
		_.#stack = [{
			handle: rootHandle,
			trigger: null
		}];
		for (const [handle, panel] of _.#panels) _.#setPanelState(panel, handle === rootHandle ? "current" : "next");
	}
	#attachListeners() {
		const _ = this;
		_.#handlers.click = (event) => {
			const pushTrigger = event.target.closest("[data-action-stack-push]");
			if (pushTrigger && _.contains(pushTrigger)) {
				const target = pushTrigger.getAttribute("target");
				if (target) {
					event.preventDefault();
					_.push(target, pushTrigger);
				}
				return;
			}
			const popTrigger = event.target.closest("[data-action-stack-pop]");
			if (popTrigger && _.contains(popTrigger)) {
				event.preventDefault();
				_.pop();
			}
		};
		_.addEventListener("click", _.#handlers.click);
		_.#handlers.keydown = (event) => {
			if (event.key !== "Escape") return;
			if (event.defaultPrevented) return;
			if (_.depth <= 1) return;
			event.preventDefault();
			event.stopPropagation();
			_.pop();
		};
		_.addEventListener("keydown", _.#handlers.keydown);
	}
	#setPanelState(panel, state) {
		if (!panel) return;
		panel.setAttribute("state", state);
		if (state === "current") panel.removeAttribute("inert");
		else panel.setAttribute("inert", "");
	}
	#focus(preferred = null) {
		if (preferred?.isConnected) preferred.focus({ preventScroll: true });
		else this.currentPanel?.focus({ preventScroll: true });
	}
	#emit(name, options = {}) {
		const { cancelable = false, ...detail } = options;
		const event = new CustomEvent(`panel-stack:${name}`, {
			bubbles: true,
			composed: true,
			cancelable,
			detail
		});
		return this.dispatchEvent(event);
	}
};
/**
* <stack-panel> — a single panel inside a <panel-stack>.
*
* Carries a `handle` attribute used as its identifier in the stack. The parent
* <panel-stack> drives its `state` attribute (`current` | `previous` | `next`)
* which the CSS uses to position and animate the panel.
*
* Overrides focus() to delegate to the first focusable child — preferring an
* element marked `data-stack-focus`, then falling back to the first focusable
* descendant.
*/
var StackPanel = class extends HTMLElement {
	connectedCallback() {
		if (!this.hasAttribute("role")) this.setAttribute("role", "group");
	}
	focus(options) {
		const target = this.querySelector("[data-stack-focus]") ?? this.querySelector("button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"]):not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
		if (target) target.focus(options);
	}
};
if (!customElements.get("panel-stack")) customElements.define("panel-stack", PanelStack);
if (!customElements.get("stack-panel")) customElements.define("stack-panel", StackPanel);
//#endregion
export { PanelStack, StackPanel };

//# sourceMappingURL=panel-stack.esm.js.map