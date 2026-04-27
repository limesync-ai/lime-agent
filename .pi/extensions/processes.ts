import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// Vendored at repo root (`pi-processes/`). Jiti loads the TS source directly.
import registerProcesses from "../../pi-processes/src/index.ts";

export default function (pi: ExtensionAPI) {
	return registerProcesses(pi);
}
