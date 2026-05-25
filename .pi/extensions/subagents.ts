import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// Vendored at repo root via git subtree (`pi-subagents/`). Load the TS source
// directly so local renderer/style changes are picked up by Pi's extension
// loader without rebuilding the vendored package.
import registerSubagents from "../../pi-subagents/src/index.ts";

export default function (pi: ExtensionAPI) {
	return registerSubagents(pi);
}
