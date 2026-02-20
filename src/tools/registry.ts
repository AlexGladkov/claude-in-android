import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";

export interface ToolDefinition {
  tool: Tool;
  handler: (args: Record<string, unknown>, ctx: ToolContext, depth?: number) => Promise<unknown>;
}

const toolMap = new Map<string, ToolDefinition>();
const aliasMap = new Map<string, string>();

export function registerTools(defs: ToolDefinition[]): void {
  for (const def of defs) {
    toolMap.set(def.tool.name, def);
  }
}

export function registerAliases(aliases: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(aliases)) {
    aliasMap.set(alias, canonical);
  }
}

export function getTools(): Tool[] {
  return [...toolMap.values()].map(d => d.tool);
}

export function getHandler(name: string): ToolDefinition["handler"] | undefined {
  const direct = toolMap.get(name);
  if (direct) return direct.handler;

  const canonical = aliasMap.get(name);
  if (canonical) return toolMap.get(canonical)?.handler;

  return undefined;
}
