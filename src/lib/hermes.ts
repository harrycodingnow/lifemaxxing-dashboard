import { spawn } from "child_process";

/**
 * Invoke the local hermes CLI in one-shot mode with --yolo.
 * The prompt should instruct hermes to return strict JSON on the LAST line
 * (we extract the last JSON object/array from stdout).
 */
export async function hermesCall(prompt: string, opts: { timeoutMs?: number } = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const bin = process.env.HERMES_BIN || "/Users/harryhou/.local/bin/hermes";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-z", prompt, "--yolo", "--ignore-rules"], {
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`hermes timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`hermes exit ${code}: ${err || out}`));
      resolve(out.trim());
    });
  });
}

/** Extract the last fenced or bare JSON blob from hermes output. */
export function extractJson<T = unknown>(text: string): T {
  // Try fenced ```json ... ``` first
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenced.length) {
    const last = fenced[fenced.length - 1][1].trim();
    return JSON.parse(last) as T;
  }
  // Find last balanced { ... } or [ ... ]
  const candidates: string[] = [];
  for (const open of ["{", "["]) {
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === open) {
        if (depth === 0) start = i;
        depth++;
      } else if (c === close) {
        depth--;
        if (depth === 0 && start !== -1) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  if (!candidates.length) throw new Error(`no JSON found in hermes output:\n${text.slice(0, 500)}`);
  // Pick the longest (most likely the actual answer)
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {}
  }
  throw new Error("no parseable JSON candidate");
}
