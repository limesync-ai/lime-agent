import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// Vendored at repo root via git subtree (`pi-subagents/`). We intentionally
// import the prebuilt `dist/` bundle rather than the TS source so the
// extension brings its own resolved deps from `pi-subagents/node_modules/` —
// no need to add it as a workspace package or share lockfiles.
import registerSubagents from "../../pi-subagents/dist/index.js";

export default function (pi: ExtensionAPI) {
	return registerSubagents(pi);
}
