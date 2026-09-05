export class PanelStack extends HTMLElement {
	/** Handle of the current panel. Setting it navigates, like the `current` attribute. */
	current: string | null;
	readonly currentHandle: string | null;
	readonly currentPanel: StackPanel | null;
	readonly depth: number;
	push(handle: string, trigger?: Element | null): boolean;
	pop(): boolean;
	reset(): void;
}

export class StackPanel extends HTMLElement {
	focus(options?: FocusOptions): void;
}

declare global {
	interface HTMLElementTagNameMap {
		'panel-stack': PanelStack;
		'stack-panel': StackPanel;
	}

	interface HTMLElementEventMap {
		'panel-stack:push': CustomEvent<{
			fromHandle: string | null;
			toHandle: string;
		}>;
		'panel-stack:pop': CustomEvent<{
			fromHandle: string;
			toHandle: string;
		}>;
		'panel-stack:reset': CustomEvent<{
			rootHandle: string;
		}>;
	}
}
