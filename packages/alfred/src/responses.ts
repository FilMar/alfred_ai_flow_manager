/**
 * Factory per le risposte dei tool alfred.
 * Elimina il boilerplate `{ content: [{ type: "text" as const, text }], details }` ripetuto.
 */

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}

export function textResponse(text: string, details: unknown = {}): ToolResponse {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

export function errorResponse(message: string): ToolResponse {
  return textResponse(message, {});
}
