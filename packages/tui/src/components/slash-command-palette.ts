import { fuzzyFilter } from "../fuzzy.js";
import { getKeybindings } from "../keybindings.js";
import { parseMouseEvent } from "../mouse.js";
import type { Component, Focusable, TUI } from "../tui.js";
import { truncateToWidth, visibleWidth } from "../utils.js";
import { Input } from "./input.js";
import type { SelectItem, SelectListLayoutOptions, SelectListTheme } from "./select-list.js";

const DEFAULT_PRIMARY_COLUMN_WIDTH = 32;
const PRIMARY_COLUMN_GAP = 2;
const MIN_DESCRIPTION_WIDTH = 10;

export interface SlashCommandPaletteTheme {
	borderColor: (str: string) => string;
	headerTextColor?: (str: string) => string;
	selectList: SelectListTheme;
}

export class SlashCommandPalette implements Component, Focusable {
	private tui: TUI;
	private searchInput: Input;
	private items: SelectItem[] = [];
	private filteredItems: SelectItem[] = [];
	private selectedIndex = 0;
	private theme: SlashCommandPaletteTheme;
	private layout: SelectListLayoutOptions;
	private maxVisible: number;
	private targetHeight?: () => number | undefined;
	private _focused = false;

	public onSelect?: (item: SelectItem) => void;
	public onCancel?: () => void;

	constructor(
		tui: TUI,
		items: SelectItem[],
		theme: SlashCommandPaletteTheme,
		layout?: SelectListLayoutOptions,
		maxVisible = 10,
		targetHeight?: () => number | undefined,
	) {
		this.tui = tui;
		this.items = items;
		this.filteredItems = items;
		this.theme = theme;
		this.layout = layout ?? {};
		this.maxVisible = maxVisible;
		this.targetHeight = targetHeight;
		this.searchInput = new Input();
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	setSearch(value: string): void {
		this.searchInput.setValue(value);
		this.filterItems(value);
	}

	private filterItems(query: string): void {
		if (!query.trim()) {
			this.filteredItems = this.items;
		} else {
			this.filteredItems = fuzzyFilter(this.items, query, (item) => item.label || item.value);
		}
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredItems.length - 1));
	}

	handleInput(data: string): void {
		// Try mouse event first
		const mouseEv = parseMouseEvent(data);
		if (mouseEv) {
			this.handleMouseEvent(mouseEv);
			return;
		}

		const kb = getKeybindings();

		if (kb.matches(data, "tui.select.up")) {
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
			return;
		}

		if (kb.matches(data, "tui.select.down")) {
			this.selectedIndex = this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
			return;
		}

		if (kb.matches(data, "tui.select.confirm")) {
			const selected = this.filteredItems[this.selectedIndex];
			if (selected) {
				this.onSelect?.(selected);
			}
			return;
		}

		if (kb.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}

		// Pass everything else to the search input for typing / deletion / cursor movement
		this.searchInput.handleInput(data);
		this.filterItems(this.searchInput.getValue());
	}

	private handleMouseEvent(ev: ReturnType<typeof parseMouseEvent>): void {
		if (!ev) return;
		const pos = this.tui.getOverlayPosition(this);
		if (!pos) return;

		const relRow = ev.row - pos.row;
		const relCol = ev.col - pos.col;

		// Ignore clicks outside the modal bounds
		if (relRow < 0 || relRow >= pos.height || relCol < 0 || relCol >= pos.width) {
			return;
		}

		// Wheel events: scroll the list
		if (ev.button === 64) {
			// wheel-up
			if (ev.kind === "press") {
				this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
				this.tui.requestRender();
			}
			return;
		}
		if (ev.button === 65) {
			// wheel-down
			if (ev.kind === "press") {
				this.selectedIndex = this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
				this.tui.requestRender();
			}
			return;
		}

		// Only handle left-button interactions
		if (ev.button !== 0) return;

		// List body starts after top border (1) + search input (1) + separator (1) = row 3
		const LIST_BODY_START = 3;
		if (relRow < LIST_BODY_START) return;

		// Account for bottom border
		const bottomBorderRow = pos.height - 1;
		if (relRow >= bottomBorderRow) return;

		const listRow = relRow - LIST_BODY_START;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
		);
		const itemIndex = startIndex + listRow;

		if (itemIndex < 0 || itemIndex >= this.filteredItems.length) return;

		if (ev.kind === "press") {
			this.selectedIndex = itemIndex;
			this.tui.requestRender();
		} else if (ev.kind === "release") {
			const selected = this.filteredItems[itemIndex];
			if (selected) {
				this.onSelect?.(selected);
			}
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const borderColor = this.theme.borderColor;
		const headerColor = this.theme.headerTextColor ?? borderColor;
		const innerWidth = Math.max(1, width - 2);

		// Top border with centered title
		const title = " Command Palette ";
		const titleWidth = visibleWidth(title);
		if (titleWidth + 2 <= width) {
			const leftPad = Math.floor((innerWidth - titleWidth) / 2);
			const rightPad = innerWidth - leftPad - titleWidth;
			lines.push(
				borderColor("┌") +
					borderColor("─".repeat(leftPad)) +
					headerColor(title) +
					borderColor("─".repeat(rightPad)) +
					borderColor("┐"),
			);
		} else {
			lines.push(borderColor("┌") + borderColor("─".repeat(innerWidth)) + borderColor("┐"));
		}

		// Search input line
		const inputLines = this.searchInput.render(innerWidth);
		for (const line of inputLines) {
			lines.push(borderColor("│") + line + borderColor("│"));
		}

		// Separator between search and list
		lines.push(borderColor("├") + borderColor("─".repeat(innerWidth)) + borderColor("┤"));

		// List items
		if (this.filteredItems.length === 0) {
			const noMatchText = "  No matching commands";
			const noMatchLine = this.theme.selectList.noMatch(noMatchText);
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(noMatchLine)));
			lines.push(borderColor("│") + noMatchLine + padding + borderColor("│"));
		} else {
			const primaryColumnWidth = this.getPrimaryColumnWidth(innerWidth);
			const startIndex = Math.max(
				0,
				Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
			);
			const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

			for (let i = startIndex; i < endIndex; i++) {
				const item = this.filteredItems[i];
				if (!item) continue;
				const isSelected = i === this.selectedIndex;
				const line = this.renderItem(item, isSelected, innerWidth, primaryColumnWidth);
				const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(line)));
				lines.push(borderColor("│") + line + padding + borderColor("│"));
			}

			// Scroll indicator
			if (startIndex > 0 || endIndex < this.filteredItems.length) {
				const scrollText = `  (${this.selectedIndex + 1}/${this.filteredItems.length})`;
				const scrollLine = this.theme.selectList.scrollInfo(truncateToWidth(scrollText, innerWidth - 2, ""));
				const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(scrollLine)));
				lines.push(borderColor("│") + scrollLine + padding + borderColor("│"));
			}
		}

		// Pad with empty side-walled rows so the palette renders at a fixed
		// total row count regardless of how many items match the filter.
		const target = this.targetHeight?.();
		if (target && target > 0) {
			const blank = borderColor("│") + " ".repeat(innerWidth) + borderColor("│");
			while (lines.length < target - 1) {
				lines.push(blank);
			}
		}

		// Bottom border
		lines.push(borderColor("└") + borderColor("─".repeat(innerWidth)) + borderColor("┘"));

		return lines;
	}

	private renderItem(item: SelectItem, isSelected: boolean, width: number, primaryColumnWidth: number): string {
		const prefix = isSelected ? "→ " : "  ";
		const prefixWidth = visibleWidth(prefix);
		const description = item.description ? item.description.replace(/[\r\n]+/g, " ").trim() : undefined;

		if (description && width > 40) {
			const effectivePrimaryColumnWidth = Math.max(1, Math.min(primaryColumnWidth, width - prefixWidth - 4));
			const maxPrimaryWidth = Math.max(1, effectivePrimaryColumnWidth - PRIMARY_COLUMN_GAP);
			const displayValue = item.label || item.value;
			const truncatedValue = truncateToWidth(displayValue, maxPrimaryWidth, "");
			const truncatedValueWidth = visibleWidth(truncatedValue);
			const spacing = " ".repeat(Math.max(1, effectivePrimaryColumnWidth - truncatedValueWidth));
			const descriptionStart = prefixWidth + truncatedValueWidth + spacing.length;
			const remainingWidth = width - descriptionStart - 2;

			if (remainingWidth > MIN_DESCRIPTION_WIDTH) {
				const truncatedDesc = truncateToWidth(description, remainingWidth, "");
				if (isSelected) {
					const inner = `${prefix}${truncatedValue}${spacing}${truncatedDesc}`;
					const trailing = " ".repeat(Math.max(0, width - visibleWidth(inner)));
					return this.theme.selectList.selectedText(inner + trailing);
				}
				return prefix + truncatedValue + this.theme.selectList.description(spacing + truncatedDesc);
			}
		}

		const maxWidth = width - prefixWidth - 2;
		const displayValue = item.label || item.value;
		const truncatedValue = truncateToWidth(displayValue, maxWidth, "");
		if (isSelected) {
			const inner = `${prefix}${truncatedValue}`;
			const trailing = " ".repeat(Math.max(0, width - visibleWidth(inner)));
			return this.theme.selectList.selectedText(inner + trailing);
		}
		return prefix + truncatedValue;
	}

	private getPrimaryColumnWidth(availableWidth: number): number {
		const bounds = this.getPrimaryColumnBounds();
		const widestPrimary = this.filteredItems.reduce((widest, item) => {
			return Math.max(widest, visibleWidth(item.label || item.value) + PRIMARY_COLUMN_GAP);
		}, 0);
		return Math.max(bounds.min, Math.min(widestPrimary, bounds.max, availableWidth));
	}

	private getPrimaryColumnBounds(): { min: number; max: number } {
		const rawMin =
			this.layout.minPrimaryColumnWidth ?? this.layout.maxPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH;
		const rawMax =
			this.layout.maxPrimaryColumnWidth ?? this.layout.minPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH;
		return {
			min: Math.max(1, Math.min(rawMin, rawMax)),
			max: Math.max(1, Math.max(rawMin, rawMax)),
		};
	}

	invalidate(): void {
		// No cached state
	}
}
