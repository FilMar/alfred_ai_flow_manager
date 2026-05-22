import type { TeamMember, AgentTurnResult } from "./types.js";
export declare function runAgentTurn(member: TeamMember, systemPrompt: string, task: string, signal?: AbortSignal, projectRoot?: string): Promise<AgentTurnResult>;
