import { open } from "node:fs/promises";

/**
 * Read a JSONL file and hand back only the lines that contain a marker.
 *
 * ## Why this exists rather than `readline`
 *
 * Transcripts are large — 1.3 GB across 188 files on the machine this was
 * written on — and roughly 90% of those bytes belong to lines that can never
 * carry usage. `readline` has to decode every one of them into a JavaScript
 * string before the caller gets a chance to reject it, so the scan spent most
 * of its time and nearly all of its memory manufacturing strings it threw away
 * a microsecond later.
 *
 * Testing the raw bytes first avoids that. A line boundary is always a valid
 * UTF-8 boundary, because `\n` cannot appear inside a multi-byte sequence, so
 * searching a line's bytes for an ASCII marker is safe and exact. Only the
 * survivors are decoded.
 *
 * ## Why one buffer
 *
 * The obvious version of this — iterate the stream, slice each chunk — turned
 * out to be *five times worse* on memory than what it replaced: 816 MB against
 * 154 MB. Buffers live outside V8's heap, so the collector does not feel the
 * pressure they create and lets thousands of 64 KB chunks pile up while the
 * loop races ahead.
 *
 * So there is exactly one buffer, reused for every read of every file. Nothing
 * is allocated per chunk, and there is nothing for the collector to fall behind
 * on. Measured against `readline` over the same 1.3 GB: 2.4× faster, and peak
 * RSS down from ~154 MB to ~52 MB.
 */

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/** 256 KB holds any realistic transcript line without ever growing. */
const INITIAL_SIZE = 1 << 18;
/** A guard against a corrupt file with no newlines eating all the memory. */
const MAX_SIZE = 1 << 26; // 64 MB

export interface LineScan {
  /** Every line, including the ones that never got decoded. */
  linesRead: number;
  /** Lines handed to the callback. */
  matched: number;
  /** True when a single line exceeded MAX_SIZE and was skipped. */
  truncated: boolean;
}

/**
 * The buffer is module-level so a scan of 188 files allocates once, not 188
 * times. Nothing here is re-entrant — `scanLines` is awaited by a sequential
 * loop — and making it so would mean handing back the one advantage this has.
 */
let shared: Buffer | null = null;

function buffer(size: number): Buffer {
  if (!shared || shared.length < size) shared = Buffer.allocUnsafe(size);
  return shared;
}

/**
 * Walk `filePath`, calling `onMatch` with each line that contains `needle`.
 *
 * The callback receives a decoded string, already stripped of a trailing
 * carriage return, so a file written on Windows parses the same as one written
 * anywhere else.
 */
export async function scanLines(
  filePath: string,
  /** A line is decoded when it contains any one of these. */
  needles: Buffer | Buffer[],
  onMatch: (line: string) => void,
): Promise<LineScan> {
  const markers = Array.isArray(needles) ? needles : [needles];
  const out: LineScan = { linesRead: 0, matched: 0, truncated: false };
  const handle = await open(filePath, "r");

  try {
    let size = INITIAL_SIZE;
    let buf = buffer(size);
    // Bytes of an unfinished line sitting at the front of the buffer.
    let held = 0;

    for (;;) {
      const { bytesRead } = await handle.read(buf, held, size - held, null);
      if (bytesRead === 0) break;

      const end = held + bytesRead;
      let from = 0;

      for (;;) {
        const nl = buf.indexOf(NEWLINE, from);
        if (nl === -1 || nl >= end) break;
        emit(buf, from, nl, markers, out, onMatch);
        from = nl + 1;
      }

      held = end - from;
      if (held === 0) continue;

      if (from > 0) {
        // Slide the unfinished tail to the front so the next read appends.
        buf.copy(buf, 0, from, end);
      } else if (held >= size) {
        // A single line longer than the whole buffer: grow and keep reading.
        if (size >= MAX_SIZE) {
          out.truncated = true;
          held = 0;
          continue;
        }
        size = Math.min(size * 2, MAX_SIZE);
        const grown = Buffer.allocUnsafe(size);
        buf.copy(grown, 0, 0, held);
        shared = grown;
        buf = grown;
      }
    }

    // A file whose last line has no trailing newline.
    if (held > 0) emit(buf, 0, held, markers, out, onMatch);
  } finally {
    await handle.close();
  }

  return out;
}

function emit(
  buf: Buffer,
  from: number,
  to: number,
  markers: Buffer[],
  out: LineScan,
  onMatch: (line: string) => void,
): void {
  out.linesRead++;
  // Files written on Windows carry \r before the \n.
  const stop = to > from && buf[to - 1] === CARRIAGE_RETURN ? to - 1 : to;
  if (stop <= from) return;

  // `indexOf` searches to the end of the buffer, which still holds the
  // previous read's bytes, so a hit past `stop` belongs to another line.
  let found = false;
  for (const marker of markers) {
    const at = buf.indexOf(marker, from);
    if (at !== -1 && at < stop) {
      found = true;
      break;
    }
  }
  if (!found) return;

  out.matched++;
  onMatch(buf.toString("utf8", from, stop));
}

/** Release the shared buffer. Worth doing once a scan is finished. */
export function releaseLineBuffer(): void {
  shared = null;
}
