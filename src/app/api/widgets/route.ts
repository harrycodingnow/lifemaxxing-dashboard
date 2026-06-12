import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CustomWidgetRow = {
  id: number;
  created_ts: number;
  updated_ts: number;
  title: string;
  prompt: string;
  html: string;
  w: number;
  h: number;
  archived_at: number | null;
};

// List all active (non-archived) custom widgets.
export async function GET() {
  const rows = db
    .prepare("SELECT * FROM custom_widgets WHERE archived_at IS NULL ORDER BY created_ts ASC")
    .all() as CustomWidgetRow[];
  return NextResponse.json({ widgets: rows });
}
