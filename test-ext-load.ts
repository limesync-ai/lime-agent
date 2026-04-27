import { DefaultResourceLoader } from "./packages/coding-agent/src/core/resource-loader.js";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: process.env.HOME + "/.pi/agent",
});

await loader.reload();

const result = loader.getExtensions();
console.log("Extensions loaded:", result.extensions.length);
console.log("Errors:", result.errors.length);
for (const e of result.errors) {
  console.log("  ERROR:", e.path, "-", e.error);
}
for (const ext of result.extensions) {
  const tools = [...ext.tools.keys()];
  const commands = [...ext.commands.keys()];
  console.log("  EXT:", ext.path, "| tools:", tools.join(","), "| cmds:", commands.join(","));
}
process.exit(0);
