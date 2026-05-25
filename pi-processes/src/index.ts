import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupProcessesCommands } from "./commands";
import { registerProcessesSettings } from "./commands/settings";
import { configLoader } from "./config";
import { setupProcessesHooks } from "./hooks";
import { ProcessManager } from "./manager";
import { setupProcessesTools } from "./tools";

export default async function (pi: ExtensionAPI) {
  if (process.platform === "win32") {
    pi.on("session_start", async (_event, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify("processes extension not available on Windows", "warning");
    });
    return;
  }

  await configLoader.load();
  const manager = new ProcessManager({
    getConfiguredShellPath: () => configLoader.getConfig().execution.shellPath,
  });

  const config = configLoader.getConfig();

  const { update: updateWidget, dockActions } = setupProcessesHooks(
    pi,
    manager,
    config,
  );
  const unsubscribeInterrupt = pi.events.on("interactive:interrupt", () => {
    void manager.killAllLive().then(() => updateWidget());
  });
  pi.on("session_shutdown", () => {
    unsubscribeInterrupt();
  });
  setupProcessesCommands(pi, manager, dockActions);
  setupProcessesTools(pi, manager);
  registerProcessesSettings(pi, () => {
    updateWidget();
  });
}
