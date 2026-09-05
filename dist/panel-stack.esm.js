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
* Controlled mode — the `current` attribute names the panel that should be
* current, and the component reflects it back after every navigation, whatever
* the source (API call, declarative trigger, Escape key):
*   <panel-stack current="shop">       — attribute in, attribute out
*   stack.current = 'shop'             — property mirror of the same thing
*
* Programmatic API:
*   stack.push('shop')                 — focus moves to first focusable in shop
*   stack.push('shop', triggerEl)      — pop() will restore focus to triggerEl
*   stack.pop()
*   stack.reset()
*
* Events (all bubble + composed):
*   panel-stack:push   → detail { fromHandle, toHandle }   cancelable
*   panel-stack:pop    → detail { fromHandle, toHandle }
*   panel-stack:reset  → detail { rootHandle }
*   panel-stack:change → detail { handle }   after the stack settles
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
	#reflecting = false;
	#observer = null;
	#lastChange = null;
	#handlers = {
		click: null,
		keydown: null
	};
	static get observedAttributes() {
		return ["current"];
	}
	connectedCallback() {
		const _ = this;
		if (!_.#initialized) {
			_.#initialized = true;
			_.#queryDOM();
			_.#initState();
		} else _.#rescan();
		_.#attachListeners();
	}
	/**
	* `current` is the one controlled attribute. Writes before the element has
	* initialized are ignored — connectedCallback reads the authored value once
	* the panels are indexed — and writes the component made itself are skipped.
	*/
	attributeChangedCallback(name, oldValue, newValue) {
		const _ = this;
		if (name !== "current" || _.#reflecting || !_.#initialized) return;
		_.#applyCurrent(newValue);
	}
	disconnectedCallback() {
		const _ = this;
		if (_.#observer) {
			_.#observer.disconnect();
			_.#observer = null;
		}
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
		if (_.#initialized && !_.#panels.has(handle)) _.#rescan();
		const target = _.#panels.get(handle);
		if (!target) return false;
		const fromHandle = _.currentHandle;
		if (fromHandle === handle) return false;
		if (_.#stack.some((frame) => frame.handle === handle)) return _.#popTo(handle);
		if (!_.#emit("push", {
			fromHandle,
			toHandle: handle,
			cancelable: true
		})) return false;
		const fromPanel = _.#panels.get(fromHandle);
		_.#setPanelState(target, "current");
		_.#stack.push({
			handle,
			trigger
		});
		_.#focus();
		_.#setPanelState(fromPanel, "previous");
		_.#reflect();
		return true;
	}
	/**
	* Pop the top panel off the stack.
	* @returns {boolean} false if at root, true otherwise
	*/
	pop() {
		const _ = this;
		if (_.#stack.length <= 1) return false;
		const popped = _.#stack[_.#stack.length - 1];
		const dest = _.#stack[_.#stack.length - 2];
		_.#emit("pop", {
			fromHandle: popped.handle,
			toHandle: dest.handle
		});
		const fromPanel = _.#panels.get(popped.handle);
		const toPanel = _.#panels.get(dest.handle);
		_.#setPanelState(toPanel, "current");
		_.#stack.pop();
		_.#focus(popped.trigger);
		_.#setPanelState(fromPanel, "next");
		_.#reflect();
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
		_.#reflect();
	}
	/** Read-only: handle of the panel currently on top of the stack. */
	get currentHandle() {
		return this.#stack[this.#stack.length - 1]?.handle ?? null;
	}
	/**
	* The handle of the current panel. Mirrors `currentHandle` on read; on write
	* it navigates exactly like setting the `current` attribute does.
	*/
	get current() {
		return this.currentHandle;
	}
	set current(handle) {
		if (handle == null) {
			this.#reflect();
			return;
		}
		this.setAttribute("current", String(handle));
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
		const authored = _.getAttribute("current");
		if (authored && authored !== rootHandle && _.#panels.has(authored)) _.#stack.push({
			handle: authored,
			trigger: null
		});
		const currentHandle = _.currentHandle;
		for (const [handle, panel] of _.#panels) if (handle === currentHandle) _.#setPanelState(panel, "current");
		else _.#setPanelState(panel, handle === rootHandle ? "previous" : "next");
		_.#lastChange = currentHandle;
		_.#reflect();
	}
	/**
	* Write the real current handle back to the `current` attribute. Called
	* after every state change so the attribute is always trustworthy — and
	* after a rejected change (unknown handle, cancelled push) so a controlling
	* parent sees its optimistic value undone.
	*/
	#reflect() {
		const _ = this;
		const handle = _.currentHandle;
		if (handle == null) return;
		if (_.getAttribute("current") !== handle) {
			_.#reflecting = true;
			try {
				_.setAttribute("current", handle);
			} finally {
				_.#reflecting = false;
			}
		}
		if (handle !== _.#lastChange) {
			_.#lastChange = handle;
			_.#emit("change", { handle });
		}
	}
	/**
	* Pop until `handle` is current. One panel-stack:pop per level.
	* @param {string} handle — a handle already in the stack
	* @returns {boolean} true if the stack ended up there
	*/
	#popTo(handle) {
		const _ = this;
		const index = _.#stack.findIndex((frame) => frame.handle === handle);
		if (index === -1) return false;
		while (_.#stack.length - 1 > index) if (!_.pop()) break;
		return _.currentHandle === handle;
	}
	/**
	* Resolve a requested `current` value against the stack:
	*   already current → no-op          root → reset()
	*   in the ancestry → pop() per level (one panel-stack:pop each)
	*   otherwise       → push() (cancelable; a cancelled push restores)
	* An unknown handle is ignored and the attribute is restored.
	* @param {string|null} handle
	*/
	#applyCurrent(handle) {
		const _ = this;
		if (handle == null) return _.#reflect();
		if (handle === _.currentHandle) return;
		if (!_.#panels.has(handle)) _.#rescan(false);
		if (!_.#panels.has(handle)) return _.#reflect();
		if (handle === _.#stack[0]?.handle) return _.reset();
		if (_.#stack.some((frame) => frame.handle === handle)) {
			_.#popTo(handle);
			return;
		}
		if (!_.push(handle)) _.#reflect();
	}
	/**
	* Re-index the <stack-panel> children after a DOM change. New panels are
	* parked off-screen (`next`); stack frames whose panel is gone are dropped,
	* so removing the current panel falls back to the nearest surviving
	* ancestor. No push/pop event fires for a DOM-driven correction.
	* @param {boolean} [reflect] — false while resolving a `current` write, so
	*   the requested value isn't clobbered before it's applied.
	*/
	#rescan(reflect = true) {
		const _ = this;
		const before = _.currentHandle;
		_.#queryDOM();
		_.#stack = _.#stack.filter((frame) => _.#panels.has(frame.handle));
		if (_.#stack.length === 0 && _.#panels.size > 0) _.#stack = [{
			handle: _.#panels.keys().next().value,
			trigger: null
		}];
		const currentHandle = _.currentHandle;
		const inStack = new Set(_.#stack.map((frame) => frame.handle));
		if (currentHandle !== before) {
			_.#setPanelState(_.#panels.get(currentHandle), "current");
			for (const [handle, panel] of _.#panels) if (handle !== currentHandle) _.#setPanelState(panel, inStack.has(handle) ? "previous" : "next");
			_.#focus();
		} else for (const [handle, panel] of _.#panels) if (!inStack.has(handle) && panel.getAttribute("state") !== "next") _.#setPanelState(panel, "next");
		if (reflect) _.#reflect();
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
		if (typeof MutationObserver === "function") {
			_.#observer = new MutationObserver(() => _.#rescan());
			_.#observer.observe(_, { childList: true });
		}
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