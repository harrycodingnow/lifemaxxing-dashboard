import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["trades", "meals", "weights", "chat_log", "settings", "all"]);

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.join(",")];
  for (const r of rows) out.push(headers.map((h) => escape(r[h])).join(","));
  return out.join("\n");
}

function dump(table: string): Array<Record<string, unknown>> {
  return db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const table = (url.searchParams.get("table") || "all").toLowerCase();
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  if (!ALLOWED.has(table)) {
    return NextResponse.json({ error: `unknown table; allowed: ${Array.from(ALLOWED).join(", ")}` }, { status: 400 });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  if (table === "all") {
    const payload = {
      exported_at: new Date().toISOString(),
      trades: dump("trades"),
      meals: dump("meals"),
      weights: dump("weights"),
      chat_log: dump("chat_log"),
      settings: dump("settings"),
    };
    if (format === "csv") {
      return NextResponse.json({ error: "csv requires explicit ?table= (not 'all')" }, { status: 400 });
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="lifemaxx-export-${ts}.json"`,
      },
    });
  }

  const rows = dump(table);
  if (format === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="lifemaxx-${table}-${ts}.csv"`,
      },
    });
  }
  return new NextResponse(JSON.stringify(rows, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="lifemaxx-${table}-${ts}.json"`,
    },
  });
}
