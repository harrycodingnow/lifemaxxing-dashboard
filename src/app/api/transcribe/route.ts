import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import * as path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT = path.join(process.cwd(), "scripts", "transcribe.py");
const PYTHON = process.env.WHISPER_PYTHON || "python3";
const MODEL = process.env.WHISPER_MODEL || "base";

export async function POST(req: NextRequest) {
  const ctype = req.headers.get("content-type") || "";
  let audio: Buffer | null = null;
  let ext = "webm";

  try {
    if (ctype.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio") as File | null;
      if (!file) return NextResponse.json({ error: "no audio field" }, { status: 400 });
      const ab = await file.arrayBuffer();
      audio = Buffer.from(ab);
      const name = (file.name || "").toLowerCase();
      if (name.endsWith(".mp4") || name.endsWith(".m4a")) ext = "m4a";
      else if (name.endsWith(".wav")) ext = "wav";
      else if (name.endsWith(".ogg")) ext = "ogg";
      else if (file.type.includes("mp4")) ext = "m4a";
    } else {
      const ab = await req.arrayBuffer();
      audio = Buffer.from(ab);
    }
  } catch (e) {
    return NextResponse.json({ error: `bad upload: ${(e as Error).message}` }, { status: 400 });
  }

  if (!audio || audio.length === 0) {
    return NextResponse.json({ error: "empty audio" }, { status: 400 });
  }

  // Spawn python sidecar, pipe audio to stdin, read JSON from stdout.
  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(PYTHON, [SCRIPT, "--model", MODEL, "--ext", ext]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", (e) => {
      resolve(NextResponse.json({ error: `spawn failed: ${e.message}` }, { status: 500 }));
    });
    proc.on("close", (code) => {
      const trimmed = out.trim();
      if (code !== 0 && !trimmed) {
        resolve(NextResponse.json({ error: err.trim() || `exit ${code}` }, { status: 500 }));
        return;
      }
      try {
        const j = JSON.parse(trimmed);
        if (j.error) {
          resolve(NextResponse.json({ error: j.error }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ text: j.text || "", language: j.language }));
        }
      } catch {
        resolve(NextResponse.json({ error: `bad sidecar output: ${trimmed.slice(0, 200)}` }, { status: 500 }));
      }
    });
    proc.stdin.write(audio!);
    proc.stdin.end();
  });
}
