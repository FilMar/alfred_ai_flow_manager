import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function registerThirdBrainExtension(pi: ExtensionAPI): void {
  // ─── third_brain_save ────────────────────────────────────────────────────────
  // TODO

  // ─── third_brain_search ──────────────────────────────────────────────────────
  // TODO

  // ─── /remember ───────────────────────────────────────────────────────────────
  pi.registerCommand("remember", {
    description: "Estrai le idee atomiche interessanti dalla sessione corrente e salvale nel third brain",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agente occupato — riprova tra poco", "warning");
        return;
      }
      pi.sendUserMessage(
        "Attiva la skill third-brain: leggi l'intera sessione corrente ed estrai le idee atomiche e interessanti. Salvale nel third brain una per una.",
      );
    },
  });
}
