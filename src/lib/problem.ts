/** Extracts a human-readable message from an RFC 9457 problem response (see lib/http.ts). */
export async function problemMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const first = Array.isArray(body.errors) ? body.errors[0]?.message : undefined;
    return first ?? body.detail ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}
