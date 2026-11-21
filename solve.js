// Fast drop-in for make.fun's csv-reader 1.0.0.
//
// Returns exactly csv-reader 1.0.0's answer for every input {text, header}: the JSON value
// {columns, rows, errors}. The text is read once, left to right, with commas and double
// quotes. A U+FEFF at its very start is dropped. A record ends at LF or CRLF, and a line
// left with no characters is no record. Outside quotes a CR not followed by LF is dropped
// (error stray_cr). A field that opens with a quote runs to the next quote that is not
// doubled, "" inside it one quote and each CRLF or lone CR inside it read as LF; what
// follows its closing quote, up to the next comma or line break, is appended as it stands
// (quote_junk, when the field ends); a quote that never closes is a literal character, and
// the text after it is read again as unquoted (unterminated_quote). A quote inside an
// unquoted field is a literal character. Fields stay strings, never trimmed or converted.
// columns is the first record when header is true, else null; rows holds the records after
// it (every record when header is false), each padded with empty strings (short_row, with
// fields: its field count) or cut (long_row, with extra: the cut fields) to the first
// record's width. Each error is {code, line, row}, in the order met, a record's short_row
// or long_row when it ends: line the 1-based line its record starts on, counting every LF,
// CRLF and lone CR inside quotes, and row its record's index in rows, null for the header.
//
// Faster than the reference by scanning with native primitives instead of one character at
// a time: a record whose line holds no quote and no stray CR is split in one native call;
// inside a record, a run of unquoted fields up to the next quoted field (or the line's
// end) is split in one native call; an unquoted field otherwise ends at the next comma, CR
// or LF found by one native regex scan; and a quoted field is found by indexOf for its
// closing quote, its "" escapes and line breaks handled per slice. No WebAssembly, no
// native addon, no prebuilt binary, no dependency. Pure: no clock, no randomness, no
// locale, nothing kept from one call to the next.

/** The terminators of an unquoted field: comma, CR or LF. */
const TERM = /[,\r\n]/g;

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text (the record ends). */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Appends text[start, end) to value, turning each CRLF or lone CR inside it into one LF
  // and counting every line break it holds.
  function appendSegment(value, start, end) {
    const seg = text.slice(start, end);
    let j = seg.indexOf('\n');
    if (j === -1) j = seg.indexOf('\r');
    if (j === -1) return value === '' ? seg : value + seg;
    const out = seg.replace(/\r\n?/g, '\n');
    let i = -1;
    while ((i = out.indexOf('\n', i + 1)) !== -1) line++;
    return value === '' ? out : value + out;
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). Returns the field and how it ended; `added`
  // counts the characters kept. Used for one field at a time where a run cannot be split
  // (a stray CR in it) and for the junk after a closing quote.
  function readUnquoted(value) {
    let added = 0;
    while (pos < len) {
      TERM.lastIndex = pos;
      const m = TERM.exec(text);
      if (m === null) {
        if (pos < len) {
          added += len - pos;
          value += text.slice(pos);
          pos = len;
        }
        return { value, ended: END, added };
      }
      const i = m.index;
      if (i > pos) {
        added += i - pos;
        value += text.slice(pos, i);
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: at a line break when followed by LF, else dropped (stray_cr).
      if (text.charCodeAt(i + 1) === 10) {
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      pushError('stray_cr');
      pos = i + 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let start = pos;
    while (true) {
      const q = text.indexOf('"', start);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        value = appendSegment(value, start, q);
        value += '"';
        start = q + 2;
        continue;
      }
      value = appendSegment(value, start, q);
      pos = q + 1;
      if (pos >= len) return { value, ended: END };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the next comma
      // or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) pushError('quote_junk');
      return junk;
    }
  }

  // Finishes a record: the first record sets the width (and is the header when header is
  // true); the rest are padded or cut to it, with short_row or long_row recorded.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record is one line holding no quote and no stray CR, so its fields
    // are the line's comma-separated slices (a CRLF ending is not part of the last field).
    // A quote or a CR in the line sends it to the slow path; the line itself is only
    // sliced when it is clean.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const qi = text.indexOf('"', pos);
    if (qi === -1 || qi >= lineEnd) {
      const contentEnd = nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
      const ri = text.indexOf('\r', pos);
      if (ri === -1 || ri >= contentEnd) {
        const fields = text.slice(pos, contentEnd).split(',');
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
        // A line left with no characters is no record.
        if (fields.length === 1 && fields[0] === '') continue;
        finishRecord(fields);
        continue;
      }
    }

    // Slow path: the record holds a quote or a stray CR. A quoted field is read by
    // readQuoted; a run of unquoted fields up to the next quoted field, or the line's
    // end, is split in one native call; a run holding a stray CR falls back to one field
    // at a time.
    const fields = [];
    let firstQuoted = false;
    let first = true;
    while (true) {
      if (text.charCodeAt(pos) === 34) {
        if (first) firstQuoted = true;
        const field = readQuoted();
        fields.push(field.value);
        first = false;
        if (field.ended !== COMMA) break;
        continue;
      }
      // The unquoted run: from here to the next quote at a field start, or the line's
      // end. A quote inside an unquoted field is a literal character, so only a quote
      // at a field start (here, or right after a comma) ends the run.
      const nl2 = text.indexOf('\n', pos);
      const lineEnd2 = nl2 === -1 ? len : nl2;
      let q = text.indexOf('"', pos);
      let runEnd = lineEnd2;
      let atQuote = false;
      while (q !== -1 && q < lineEnd2) {
        if (q === pos || text.charCodeAt(q - 1) === 44) {
          runEnd = q;
          atQuote = true;
          break;
        }
        q = text.indexOf('"', q + 1);
      }
      const contentEnd2 = !atQuote && nl2 !== -1 && lineEnd2 > pos && text.charCodeAt(lineEnd2 - 1) === 13 ? lineEnd2 - 1 : runEnd;
      const runSeg = text.slice(pos, contentEnd2);
      if (runSeg.indexOf('\r') !== -1) {
        // A stray CR in the run: read one field at a time instead.
        const field = readUnquoted('');
        fields.push(field.value);
        first = false;
        if (field.ended !== COMMA) break;
        continue;
      }
      const parts = runSeg.split(',');
      if (atQuote) parts.pop(); // the separator before the quoted field
      for (let k = 0; k < parts.length; k++) fields.push(parts[k]);
      if (parts.length > 0) first = false;
      if (atQuote) {
        pos = runEnd;
        continue;
      }
      // The record ends at the line break (or the end of the text).
      pos = nl2 === -1 ? len : nl2 + 1;
      if (nl2 !== -1) line += 1;
      break;
    }

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !firstQuoted) continue;
    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
