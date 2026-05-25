import { type Component, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { AgentSession } from "../../../core/agent-session.js";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.js";
import { theme } from "../theme/theme.js";

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Format token counts (similar to web-ui)
 */
function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function rightAlign(text: string, width: number, sideMargin = 2): string {
	const innerWidth = Math.max(1, width - sideMargin);
	const padding = Math.max(0, innerWidth - visibleWidth(text));
	return " ".repeat(padding) + text + " ".repeat(sideMargin);
}

function compactModelName(modelName: string): string {
	return modelName
		.replace(/^claude-/, "")
		.replace(/-20\d{6,}$/, "")
		.replace(/-latest$/, "")
		.replace(/-preview$/, "")
		.replace(/-/g, " ");
}

/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent implements Component {
	private autoCompactEnabled = true;

	constructor(
		private session: AgentSession,
		private footerData: ReadonlyFooterDataProvider,
	) {}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		// No-op: git branch is cached/invalidated by provider
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		// Git watcher cleanup handled by provider
	}

	render(width: number): string[] {
		const state = this.session.state;

		// Lime default: before any turn has produced output, show a minimal
		// Amp-style footer — thinking level on the left, model id on the right.
		// The detailed token/cost/pwd footer kicks in only once the
		// conversation has data to surface.
		const hasAssistantMessage = this.session.sessionManager
			.getEntries()
			.some((e) => e.type === "message" && e.message.role === "assistant");
		if (!hasAssistantMessage) {
			const thinking = state.thinkingLevel || "off";
			const model = compactModelName(state.model?.id || "no-model");
			const status = `${theme.fg("dim", "–")} ${theme.fg("success", thinking === "off" ? model : `${thinking}²`)}`;
			return [rightAlign(status, width), rightAlign(theme.fg("dim", this.session.sessionManager.getCwd()), width)];
		}

		// Calculate cumulative usage from ALL session entries (not just post-compaction messages)
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCacheWrite += entry.message.usage.cacheWrite;
				totalCost += entry.message.usage.cost.total;
			}
		}

		// Calculate context usage from session (handles compaction correctly).
		// After compaction, tokens are unknown until the next LLM response.
		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

		// Replace home directory with ~
		let pwd = this.session.sessionManager.getCwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home && pwd.startsWith(home)) {
			pwd = `~${pwd.slice(home.length)}`;
		}

		// Add git branch if available
		const branch = this.footerData.getGitBranch();
		if (branch) {
			pwd = `${pwd} (${branch})`;
		}

		// Add session name if set
		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			pwd = `${pwd} • ${sessionName}`;
		}

		// Build Amp-style compact status: cost on the right, model/thinking in green.
		const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
		const cost = `$${totalCost.toFixed(2)}${usingSubscription ? " (sub)" : ""}`;
		const modelName = compactModelName(state.model?.id || "no-model");
		const thinkingLevel = state.thinkingLevel || "off";
		const modelStatus = state.model?.reasoning && thinkingLevel !== "off" ? `${thinkingLevel}²` : modelName;
		const statusLine = `${theme.fg("dim", cost)} ${theme.fg("dim", "–")} ${theme.fg("success", modelStatus)}`;

		const contextStats = [];
		if (totalInput) contextStats.push(`↑${formatTokens(totalInput)}`);
		if (totalOutput) contextStats.push(`↓${formatTokens(totalOutput)}`);
		if (totalCacheRead) contextStats.push(`R${formatTokens(totalCacheRead)}`);
		if (totalCacheWrite) contextStats.push(`W${formatTokens(totalCacheWrite)}`);
		const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";
		const contextPercentDisplay =
			contextPercent === "?"
				? `?/${formatTokens(contextWindow)}${autoIndicator}`
				: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
		if (contextPercentValue > 90) {
			contextStats.push(theme.fg("error", contextPercentDisplay));
		} else if (contextPercentValue > 70) {
			contextStats.push(theme.fg("warning", contextPercentDisplay));
		} else {
			contextStats.push(contextPercentDisplay);
		}
		const compactContext = contextStats.length ? theme.fg("dim", contextStats.join(" ")) : "";
		const leftContext = truncateToWidth(compactContext, Math.max(0, width - visibleWidth(statusLine) - 4), "");
		const padding = Math.max(1, width - visibleWidth(leftContext) - visibleWidth(statusLine) - 2);
		const pwdLine = truncateToWidth(theme.fg("dim", pwd), width - 2, theme.fg("dim", "..."));
		const lines = [`${leftContext}${" ".repeat(padding)}${statusLine}  `, rightAlign(pwdLine, width)];

		// Add extension statuses on a single line, sorted by key alphabetically
		const extensionStatuses = this.footerData.getExtensionStatuses();
		if (extensionStatuses.size > 0) {
			const sortedStatuses = Array.from(extensionStatuses.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => sanitizeStatusText(text));
			const statusLine = sortedStatuses.join(" ");
			// Truncate to terminal width with dim ellipsis for consistency with footer style
			lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
		}

		return lines;
	}
}
