#!/usr/bin/env python3
"""Transcribe audio from stdin (raw bytes) using faster-whisper.

Reads audio bytes from stdin, writes them to a temp file, transcribes via
faster-whisper (CPU, int8), prints JSON {"text": "..."} to stdout.

First run downloads the model (~150MB for 'base') into ~/.cache/huggingface.
Subsequent runs are warm. Model is loaded once per process.

Args:
  --model: whisper model size (default: base). tiny|base|small|medium|large-v3
  --ext: input file extension hint (default: webm)
"""
import argparse
import json
import os
import sys
import tempfile

# Silence ctranslate2 / onnxruntime noise on stderr so node parses clean JSON.
os.environ.setdefault("CT2_VERBOSE", "0")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "base"))
    ap.add_argument("--ext", default="webm")
    args = ap.parse_args()

    audio = sys.stdin.buffer.read()
    if not audio:
        print(json.dumps({"error": "empty audio"}), file=sys.stdout)
        return 1

    tmp = tempfile.NamedTemporaryFile(suffix=f".{args.ext}", delete=False)
    try:
        tmp.write(audio)
        tmp.flush()
        tmp.close()

        # Lazy import so --help is fast.
        from faster_whisper import WhisperModel

        # int8 on CPU keeps RAM low; M-series handles base in ~1s.
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            tmp.name,
            beam_size=1,
            vad_filter=True,
            # auto language detection; works for en + zh + mixed
        )
        text = "".join(seg.text for seg in segments).strip()
        print(json.dumps({"text": text, "language": info.language}))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stdout)
        return 1
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
