import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";

export interface ToolDefinition {
  tool: Tool;
  handler: (args: Record<string, unknown>, ctx: ToolContext, depth?: number) => Promise<unknown>;
}

const toolMap = new Map<string, ToolDefinition>();

export function registerTools(defs: ToolDefinition[]): void {
  for (const def of defs) {
    toolMap.set(def.tool.name, def);
  }
}

export function getTools(): Tool[] {
  return [...toolMap.values()].map(d => d.tool);
}

export function getHandler(name: string): ToolDefinition["handler"] | undefined {
  return toolMap.get(name)?.handler;
}
