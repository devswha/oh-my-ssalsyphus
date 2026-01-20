import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { loadConfig } from "./config";
import { createBackgroundManager } from "./tools/background-manager";
import { createBackgroundTools } from "./tools/background-tools";
import { createCallOmoAgent } from "./tools/call-omo-agent";
import { createConfigHandler } from "./plugin-handlers/config-handler";

const OmoOmcsPlugin: Plugin = async (ctx: PluginInput) => {
  const pluginConfig = loadConfig(ctx.directory);
  console.log("[omo-omcs] Config loaded:", pluginConfig);

  const backgroundManager = createBackgroundManager(ctx, pluginConfig.background_task);
  const backgroundTools = createBackgroundTools(backgroundManager, ctx.client);
  const callOmoAgent = createCallOmoAgent(ctx, backgroundManager);

  // Create config handler for agent/command registration
  const configHandler = createConfigHandler({
    ctx,
    pluginConfig,
  });

  return {
    config: configHandler,
    event: async () => {},
    tool: {
      ...backgroundTools,
      call_omo_agent: callOmoAgent,
    },
  };
};

export default OmoOmcsPlugin;
