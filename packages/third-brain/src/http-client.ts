/**
 * HTTP client centralizzato per third-brain.
 * Usato da qdrant.ts, embed.ts, health.ts — nessun fetch() raw altrove.
 */

export interface HttpClientConfig {
  baseUrl: string;
  /** Timeout per singola richiesta in ms. Default: 10_000. */
  timeout?: number;
}

/** Errore HTTP con status code. Distingue errori applicativi da errori di rete. */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  /**
   * Esegui una richiesta e ritorna la Response grezza.
   * Non lancia su status non-ok — utile quando il caller deve ispezionare il codice.
   */
  async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    return globalThis.fetch(`${this.config.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(this.config.timeout ?? 10_000),
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Esegui una richiesta, lancia HttpError se la risposta non è ok.
   * Usare quando qualsiasi non-ok è un errore reale.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(method, path, body);
    if (!res.ok) {
      const text = await res.text();
      throw new HttpError(`${res.status} ${text.slice(0, 200)}`, res.status);
    }
    return res.json() as Promise<T>;
  }
}
