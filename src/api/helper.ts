import { EventSourceData } from '@type/api';

/**
 * Robust SSE parser that supports partial chunks between reads.
 * Returns:
 * - events: parsed JSON events
 * - done: whether [DONE] was received
 * - remainder: trailing partial data to prepend to the next chunk
 */
export const parseEventSource = (
  data: string
): { events: EventSourceData[]; done: boolean; remainder: string } => {
  const events: EventSourceData[] = [];
  let done = false;
  let remainder = '';

  // Split by single newlines; keep last partial line as remainder if not terminated
  const lines = data.split('\n');

  // If the data does not end with a newline, the last line may be partial
  if (!data.endsWith('\n')) {
    remainder = lines.pop() ?? '';
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(':')) continue;

    if (line.startsWith('data:')) {
      const payload = line.slice('data:'.length).trimStart();
      if (payload === '[DONE]') {
        done = true;
        continue;
      }
      try {
        const json = JSON.parse(payload);
        events.push(json);
      } catch {
        // Probably a partial JSON line; keep as remainder to be completed next read
        remainder = `data: ${payload}`;
      }
    }
  }

  return { events, done, remainder };
};

export const createMultipartRelatedBody = (
  metadata: object,
  file: File,
  boundary: string
): Blob => {
  const encoder = new TextEncoder();

  const metadataPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}\r\n`
  );
  const filePart = encoder.encode(
    `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`
  );
  const endBoundary = encoder.encode(`\r\n--${boundary}--`);

  return new Blob([metadataPart, filePart, file, endBoundary], {
    type: 'multipart/related; boundary=' + boundary,
  });
};