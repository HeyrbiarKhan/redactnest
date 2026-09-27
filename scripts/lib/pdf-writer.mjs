/**
 * A tiny PDF serialiser for the fixture script.
 *
 * The fixtures are written by hand, object by object, so a reviewer can read
 * exactly what each one carries, and so none of them is authored by the engine
 * it tests. This file only turns those objects into bytes: it numbers them,
 * works out the byte offsets, and writes the cross reference table and trailer.
 *
 * An object body is either a string, written as it stands, or a stream from
 * `stream()`, whose `/Length` is filled in from the data.
 */

/** Text to bytes, one byte per character, so binary strings survive intact. */
export function latin1(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** A stream object. `dict` is the dictionary's entries, without `<<`, `>>` or `/Length`. */
export function stream(dict, data) {
  return { dict, data: typeof data === "string" ? latin1(data) : data };
}

/** Bytes appended one piece at a time, with the running length for offsets. */
function byteSink() {
  const chunks = [];
  let length = 0;

  return {
    get length() {
      return length;
    },
    push(part) {
      const bytes = typeof part === "string" ? latin1(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    },
    bytes() {
      const out = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
      }
      return out;
    },
  };
}

function writeObject(sink, num, body) {
  sink.push(`${num} 0 obj\n`);
  if (typeof body === "string") {
    sink.push(`${body}\n`);
  } else {
    sink.push(`<< ${body.dict} /Length ${body.data.length} >>\nstream\n`);
    sink.push(body.data);
    sink.push("\nendstream\n");
  }
  sink.push("endobj\n");
}

/**
 * Serialise a whole file.
 *
 * `objects[i]` becomes object `i + 1`. `trailer` is the trailer's entries
 * besides `/Size`, for example `/Root 1 0 R /Info 9 0 R`. `prefix` is written
 * ahead of the `%PDF-` header, and the offsets count it, the way junk ahead of
 * a real file's header does.
 *
 * Returns the bytes and what an incremental update needs to follow on.
 */
export function writePdf({ objects, trailer, prefix = "", header = "%PDF-1.7\n" }) {
  const sink = byteSink();
  sink.push(prefix);
  sink.push(header);

  const offsets = objects.map((body, index) => {
    const offset = sink.length;
    writeObject(sink, index + 1, body);
    return offset;
  });

  const xrefOffset = sink.length;
  const size = objects.length + 1;

  sink.push(`xref\n0 ${size}\n`);
  sink.push("0000000000 65535 f \n");
  for (const offset of offsets) {
    sink.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  sink.push(`trailer\n<< /Size ${size} ${trailer} >>\n`);
  sink.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return { bytes: sink.bytes(), xrefOffset, size };
}

/**
 * Append an incremental update: replaced or new objects, a cross reference
 * section for just those, and a trailer pointing back at the previous one.
 *
 * The earlier revision stays in the file, exactly as an editor that saves
 * incrementally leaves it. That is what the rebuild has to leave behind.
 *
 * `objects` maps an object number to its new body.
 */
export function appendRevision(previous, { objects, trailer }) {
  const sink = byteSink();
  sink.push(previous.bytes);

  const numbers = [...objects.keys()].sort((a, b) => a - b);
  const offsets = new Map();
  for (const num of numbers) {
    offsets.set(num, sink.length);
    writeObject(sink, num, objects.get(num));
  }

  const xrefOffset = sink.length;
  const size = Math.max(previous.size, numbers.at(-1) + 1);

  sink.push("xref\n");
  for (const num of numbers) {
    sink.push(`${num} 1\n${String(offsets.get(num)).padStart(10, "0")} 00000 n \n`);
  }
  sink.push(`trailer\n<< /Size ${size} ${trailer} /Prev ${previous.xrefOffset} >>\n`);
  sink.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return { bytes: sink.bytes(), xrefOffset, size };
}
