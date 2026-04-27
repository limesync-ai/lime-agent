import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerArgs from "../../rpiv-mono/packages/rpiv-args/index.ts";

export default function (pi: ExtensionAPI) {
	return registerArgs(pi);
}
