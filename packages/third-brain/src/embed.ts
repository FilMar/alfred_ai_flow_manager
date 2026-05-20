import { ollamaClient } from "./clients.js";
import { EMBED_MODEL, VECTOR_SIZE } from "./config.js";

/**
 * Converte testo in vettore usando nomic-embed-text via Ollama.
 * Testo atteso: `why + "\n\n" + what` — contesto + contenuto, senza metadati.
 */
export async function embed(text: string): Promise<number[]> {
  const data = await ollamaClient.request<{ embeddings: number[][] }>(
    "POST",
    "/api/embed",
    { model: EMBED_MODEL, input: text },
  );
  const vector = data.embeddings[0];
  if (!vector || vector.length !== VECTOR_SIZE) {
    throw new Error(
      `Ollama returned invalid embedding: expected ${VECTOR_SIZE} dimensions, got ${vector?.length ?? 0}. ` +
      `Check that model '${EMBED_MODEL}' is correct.`
    );
  }
  return vector;
}
