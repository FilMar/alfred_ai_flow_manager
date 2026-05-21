import type { FlowStep, TeamMember, Debate } from "./types.js";
import { AlfredDatabase } from "./AlfredDatabase.js";
export declare function runFlow(flow: FlowStep[], members: TeamMember[], debate: Debate, db: AlfredDatabase, signal?: AbortSignal): Promise<void>;
