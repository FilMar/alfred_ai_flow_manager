import type { FlowStep, TeamMember, Debate } from "./types.js";
export declare function runFlow(flow: FlowStep[], members: TeamMember[], debate: Debate, signal?: AbortSignal): Promise<void>;
