/** Parses a newline-delimited JSON stream, yielding one value per complete line. */
export async function* readNdjson<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) if (line.trim()) yield JSON.parse(line) as T;
    }
    if (buffer.trim()) yield JSON.parse(buffer) as T;
  } finally {
    reader.releaseLock();
  }
}
