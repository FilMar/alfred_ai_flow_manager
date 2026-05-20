/**
 * Istanze centralizzate dei client HTTP.
 * Importa da qui — non istanziare HttpClient direttamente nei moduli.
 */

import { HttpClient } from "./http-client.js";
import { QDRANT_URL, OLLAMA_URL } from "./config.js";

/** Client per Qdrant — timeout breve, servizio locale. */
export const qdrantClient = new HttpClient({
  baseUrl: QDRANT_URL,
  timeout: 5_000,
});

/** Client per Ollama — timeout lungo, l'embedding può essere lento. */
export const ollamaClient = new HttpClient({
  baseUrl: OLLAMA_URL,
  timeout: 30_000,
});
