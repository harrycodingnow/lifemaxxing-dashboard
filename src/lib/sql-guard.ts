// SQL safety guard for the NL→SQL "ask" feature.
//
// This is a defense-in-depth layer on top of the prompt-level rules in
// ASK_PROMPT. The LLM is *asked* to follow rules; this module *enforces* them
// against the actual SQL string before we hand it to better-sqlite3.
//
// Philosophy: when in doubt, reject. The user gets a clear error and the
// dashboard never executes a query we don't fully recognize as a SELECT.
//
// We strip --line and /* block */ comments before scanning so an attacker
// can't smuggle keywords inside a comment.

export const ALLOWED_TABLES = [
  "trades",
  "meals",
  "weights",
  "todos",
  "projects",
  "subscriptions",
  "habits",
  "habit_logs",
  "cash_accounts",
  "liabilities",
  "custom_widgets",
] as const;

const DENY_KEYWORDS = [
  // Writes
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  "UPSERT",
  "MERGE",
  // Schema
  "DROP",
  "CREATE",
  "ALTER",
  "TRUNCATE",
  "RENAME",
  "REINDEX",
  // Engine controls / side effects
  "ATTACH",
  "DETACH",
  "VACUUM",
  "PRAGMA",
  "ANALYZE",
  // Transactions (we run single statements)
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE",
  // Internal tables we never want exposed
  "SQLITE_MASTER",
  "SQLITE_SCHEMA",
  "SQLITE_TEMP_MASTER",
  "SQLITE_TEMP_SCHEMA",
];

export type GuardOk = { ok: true; sql: string };
export type GuardErr = { ok: false; reason: string };
export type GuardResult = GuardOk | GuardErr;

// Strip SQL comments without consuming string literals.
// Walks the string char-by-char so a -- or /* sitting inside '…' stays put.
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const nx = sql[i + 1];
    // String literal — copy through, doubling '' escapes.
    if (c === "'") {
      out += c;
      i++;
      while (i < n) {
        const ch = sql[i];
        out += ch;
        i++;
        if (ch === "'") {
          if (sql[i] === "'") {
            // escaped quote, consume the second one and keep going
            out += sql[i];
            i++;
          } else {
            break;
          }
        }
      }
      continue;
    }
    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        const ch = sql[i];
        out += ch;
        i++;
        if (ch === '"') break;
      }
      continue;
    }
    // -- line comment
    if (c === "-" && nx === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    // /* block comment */
    if (c === "/" && nx === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Validate the SQL is a single read-only SELECT against allowed tables.
// On success returns the normalized SQL (whitespace collapsed, trailing ;
// stripped). On failure returns a human-readable reason.
export function guardSelect(rawSql: string): GuardResult {
  if (typeof rawSql !== "string" || !rawSql.trim()) {
    return { ok: false, reason: "empty SQL" };
  }
  // Working copy with comments stripped — that's what we scan.
  const stripped = stripComments(rawSql);
  // Collapse whitespace and drop trailing semicolons (one or none).
  let normalized = stripped.replace(/\s+/g, " ").trim();
  // Up to ONE trailing semicolon is fine; anything beyond means multi-statement.
  if (normalized.endsWith(";")) normalized = normalized.slice(0, -1).trim();
  // Any *remaining* semicolons = multi-statement → reject.
  // (We can't rely on better-sqlite3 to reject; .prepare runs the first.)
  if (/;/.test(normalized)) {
    return { ok: false, reason: "multiple SQL statements not allowed" };
  }
  // Has to look like SELECT or WITH ... SELECT.
  const head = normalized.slice(0, 6).toUpperCase();
  const headWith = normalized.slice(0, 4).toUpperCase();
  if (head !== "SELECT" && headWith !== "WITH") {
    return { ok: false, reason: "only SELECT (or WITH ... SELECT) queries are allowed" };
  }
  // Word-boundary scan for forbidden keywords on the comment-stripped form.
  const upper = " " + normalized.toUpperCase() + " ";
  for (const kw of DENY_KEYWORDS) {
    const pattern = new RegExp(`[^A-Z0-9_]${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^A-Z0-9_]`);
    if (pattern.test(upper)) {
      return { ok: false, reason: `forbidden keyword: ${kw}` };
    }
  }
  return { ok: true, sql: normalized };
}

// Apply a hard row cap. If the user-supplied SQL already has a LIMIT we
// respect it (but cap to maxRows); if not, we wrap it. We don't try to be
// clever about ORDER BY — just trust the planner not to spill.
export function applyRowCap(sql: string, maxRows: number): string {
  const upper = sql.toUpperCase();
  const idx = upper.lastIndexOf(" LIMIT ");
  if (idx === -1) {
    return `${sql} LIMIT ${maxRows}`;
  }
  // Existing LIMIT — parse the integer immediately after it.
  const m = sql.slice(idx + 7).match(/^\s*(\d+)/);
  if (!m) return `${sql} LIMIT ${maxRows}`;
  const declared = parseInt(m[1], 10);
  if (declared > maxRows) {
    // Replace it. Reconstruct: head + " LIMIT " + maxRows + tail (anything after the number).
    const before = sql.slice(0, idx + 7);
    const after = sql.slice(idx + 7 + m[0].length);
    return `${before}${maxRows}${after}`;
  }
  return sql;
}
