#!/usr/bin/env python3
"""Transcrição local com faster-whisper (word-level timestamps).

Uso: python3 whisper_local.py <audio.wav> [model]
Saída: JSON em stdout -> {"language","text","words":[{"start","end","word"}]}

Requer: pip install faster-whisper
Provedor opt-in: só é usado quando TRANSCRIBE_PROVIDER=whisper-local.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "uso: whisper_local.py <audio> [model]"}))
        return 2
    audio = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.stderr.write(
            "faster-whisper não instalado. Rode: pip install faster-whisper\n"
        )
        return 3

    # CPU + int8 mantém o uso de memória baixo (sem GPU neste ambiente).
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True)

    words = []
    text_parts = []
    for seg in segments:
        text_parts.append(seg.text.strip())
        for w in (seg.words or []):
            words.append(
                {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()}
            )

    print(
        json.dumps(
            {
                "language": info.language,
                "text": " ".join(p for p in text_parts if p),
                "words": words,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
