import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// Vendored at repo root (`rpiv-mono/packages/rpiv-todo/`). Jiti loads the TS source directly.
import registerTodo from "../../rpiv-mono/packages/rpiv-todo/index.ts";

export default function (pi: ExtensionAPI) {
	return registerTodo(pi);
}
