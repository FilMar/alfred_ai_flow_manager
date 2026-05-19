import type { HatId } from "./types.js";
export declare function loadHat(hatId: HatId): Promise<string>;
export declare function buildSystemPrompt(role: string, personality: string, hatContent: string, thread: string): string;
