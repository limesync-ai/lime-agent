import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerAdvisor from "../../rpiv-mono/packages/rpiv-advisor/index.ts";

export default function (pi: ExtensionAPI) {
	return registerAdvisor(pi);
}
