import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getMember, getMemberSystemPrompt } from "./members.js";

// ─── API ──────────────────────────────────────────────────────────────────────

export async function runMember(memberName: string, task: string): Promise<void> {
  const member = getMember(memberName);
  const systemPrompt = getMemberSystemPrompt(memberName);

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    skillsOverride:
      member.skills.length > 0
        ? (current) => ({
            skills: current.skills.filter((s) => member.skills.includes(s.name)),
            diagnostics: current.diagnostics,
          })
        : undefined,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    tools: member.tools,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });

  await session.prompt(task);
  process.stdout.write("\n");
}
