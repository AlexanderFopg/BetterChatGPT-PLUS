import { EventSourceData } from '@type/api';

/**
 * A more robust parser for Server-Sent Events (SSE).
 * This version processes the stream line by line, handles comments,
 * and correctly accumulates multi-line data.
 */
export const parseEventSource = (
  data: string
): '[DONE]' | EventSourceData[] => {
  const result: EventSourceData[] = [];
  // Split the data into lines
  const lines = data.split('\n');

  for (const line of lines) {
    // Ignore comment lines (starting with ':') and empty lines
    if (line.startsWith(':') || line.trim() === '') {
      continue;
    }

    // Check for the [DONE] marker
    if (line.includes('[DONE]')) {
      return '[DONE]';
    }

    if (line.startsWith('data: ')) {
      const jsonString = line.substring(6); // Remove 'data: ' prefix
      try {
        const json = JSON.parse(jsonString);
        result.push(json);
      } catch (e) {
        // This might happen with partial JSON, log it for debugging but continue
        console.warn('Could not parse SSE JSON chunk:', jsonString);
      }
    }
  }
  return result;
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
