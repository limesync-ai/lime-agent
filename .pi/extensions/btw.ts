import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBtw from "../../rpiv-mono/packages/rpiv-btw/index.ts";

export default function (pi: ExtensionAPI) {
	return registerBtw(pi);
}
