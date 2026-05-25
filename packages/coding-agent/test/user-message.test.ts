import { describe, expect, test } from "vitest";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
	return text
		.replace(ANSI_PATTERN, "")
		.replaceAll(OSC133_ZONE_START, "")
		.replaceAll(OSC133_ZONE_END, "")
		.replaceAll(OSC133_ZONE_FINAL, "");
}

describe("UserMessageComponent", () => {
	test("renders the left marker without extra leading padding", () => {
		initTheme("dark");

		const component = new UserMessageComponent("hello");
		const lines = component.render(20);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(OSC133_ZONE_START);
		expect(lines[0]).toContain(OSC133_ZONE_END + OSC133_ZONE_FINAL);
		expect(stripAnsi(lines[0])).toBe(" ▌ hello");
	});
});
