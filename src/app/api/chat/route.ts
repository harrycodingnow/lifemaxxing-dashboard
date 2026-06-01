import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db
    .prepare("SELECT id, ts, role, text, meta_json FROM chat_log ORDER BY ts DESC LIMIT 50")
    .all();
  return NextResponse.json({ messages: rows.reverse() });
}
