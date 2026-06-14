import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { hermesCall, extractJson } from "@/lib/hermes";
import { ASK_PROMPT } from "@/lib/prompts";
import { guardSelect, applyRowCap } from "@/lib/sql-guard";

// SECURITY: same posture as /api/log — this endpoint shells out to the local
// Hermes CLI with --yolo. Bind to 127.0.0.1 only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

// What Hermes returns. We treat any missing/invalid field as a failure of the
// model to follow the contract and surface it as such.
type AskOut =
  | { kind: "sql"; sql: string; params?: unknown[]; explanation?: string; display?: "table" | "scalar" | "list" }
  | { kind: "narrative"; narrative: string };

// POST /api/ask
// Body: { question: string }
// Returns:
//   200 {
//     kind: "answer",
//     display: "table" | "scalar" | "list" | "narrative",
//     answer: string,                    // human summary (narrative or fallback)
//     sql?: string,                      // executed query (after normalization)
//     params?: unknown[],
//     explanation?: string,              // model's one-sentence rationale
//     columns?: string[],
//     rows?: unknown[][],                // [[v,v,v], …]
//     row_count?: number,
//     truncated?: boolean
//   }
//   400 / 502 / 500 on failure with { error: "<reason>" }
export async function POST(req: NextRequest) {
  let body: { question?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  if (question.length > 1000) {
    return NextResponse.json({ error: "question too long (max 1000 chars)" }, { status: 400 });
  }

  // Local-time hint for the model. Use ISO without the trailing Z so it reads
  // as wall-clock rather than UTC.
  const nowIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  let parsed: AskOut;
  try {
    const raw = await hermesCall(ASK_PROMPT(question, nowIso), { timeoutMs: 90_000 });
    parsed = extractJson<AskOut>(raw);
  } catch (e) {
    return NextResponse.json(
      { error: `ask parse failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // Narrative branch — nothing to execute.
  if (parsed && parsed.kind === "narrative") {
    const narrative = String(parsed.narrative || "").trim() || "No answer.";
    return NextResponse.json({
      kind: "answer",
      display: "narrative",
      answer: narrative,
    });
  }

  if (!parsed || parsed.kind !== "sql" || typeof parsed.sql !== "string") {
    return NextResponse.json(
      { error: "model returned an invalid response shape" },
      { status: 502 },
    );
  }

  // Validate then execute.
  const guard = guardSelect(parsed.sql);
  if (!guard.ok) {
    return NextResponse.json(
      {
        error: `unsafe SQL rejected: ${guard.reason}`,
        sql: parsed.sql,
        explanation: parsed.explanation,
      },
      { status: 400 },
    );
  }
  const safeSql = applyRowCap(guard.sql, MAX_ROWS);
  const params = Array.isArray(parsed.params) ? parsed.params : [];

  let columns: string[] = [];
  let rows: unknown[][] = [];
  try {
    const stmt = db.prepare(safeSql);
    // .raw() gives us array-of-arrays, .columns() gives us the headers.
    const colInfo = stmt.columns() as Array<{ name: string }>;
    columns = colInfo.map((c) => c.name);
    rows = stmt.raw().all(...(params as never[])) as unknown[][];
  } catch (e) {
    return NextResponse.json(
      {
        error: `SQL execution failed: ${(e as Error).message}`,
        sql: safeSql,
        params,
        explanation: parsed.explanation,
      },
      { status: 400 },
    );
  }

  const truncated = rows.length >= MAX_ROWS;
  const display: "table" | "scalar" | "list" =
    parsed.display === "scalar" || parsed.display === "list" || parsed.display === "table"
      ? parsed.display
      : rows.length === 1 && columns.length === 1
        ? "scalar"
        : "table";

  // Human-friendly summary: a one-line "answer" we stuff into chat_log meta.
  let answer = parsed.explanation || "";
  if (display === "scalar" && rows[0]?.[0] != null) {
    answer = `${columns[0]} = ${rows[0][0]}${parsed.explanation ? ` — ${parsed.explanation}` : ""}`;
  } else if (rows.length === 0) {
    answer = parsed.explanation
      ? `${parsed.explanation} (no rows matched)`
      : "No matching rows.";
  } else {
    answer = parsed.explanation
      ? `${parsed.explanation} (${rows.length} row${rows.length === 1 ? "" : "s"})`
      : `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  }

  return NextResponse.json({
    kind: "answer",
    display,
    answer,
    sql: safeSql,
    params,
    explanation: parsed.explanation || null,
    columns,
    rows,
    row_count: rows.length,
    truncated,
  });
}
