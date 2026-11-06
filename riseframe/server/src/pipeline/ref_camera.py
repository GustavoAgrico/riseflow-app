#!/usr/bin/env python3
"""Mede o movimento de CÂMERA de um vídeo de referência (zoom e deslocamento).

Uso: python3 ref_camera.py <video> [sample_fps] [max_seconds]
Saída (stdout, JSON):
  {"fps": <amostras/s>, "width", "height",
   "samples": [{"t", "s", "tx", "ty", "ok"}]}
  s  = escala entre a amostra anterior e esta (1.0 = parado; 1.05 = aproximou 5%)
  tx, ty = deslocamento como fração da largura do quadro
  ok = false quando o rastreio não é confiável (corte de cena, quadro escuro/borrado)

Como: pontos rastreados (Shi-Tomasi + Lucas-Kanade) entre amostras seguidas e uma
transformação afim parcial global por RANSAC. O que a câmera explica é o movimento do
quadro inteiro; o que sobra (a pessoa, os elementos) é descartado como outlier.
Requer opencv-python-headless. Sem OpenCV ou sem vídeo: sai com código != 0 e o
chamador segue só com as medidas do FFmpeg.
"""
import json
import math
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: ref_camera.py <video> [sample_fps] [max_seconds]", file=sys.stderr)
        return 2
    try:
        import cv2
        import numpy as np
    except Exception as err:  # noqa: BLE001
        print(f"opencv indisponível: {err}", file=sys.stderr)
        return 3

    path = sys.argv[1]
    want = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0
    max_s = float(sys.argv[3]) if len(sys.argv) > 3 else 90.0

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        print("não abriu o vídeo", file=sys.stderr)
        return 4
    native = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if not math.isfinite(native) or native <= 0:
        native = 30.0
    step = max(1, int(round(native / max(1.0, want))))
    fps = native / step
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    samples = []
    prev = None
    idx = 0
    W = 320
    while True:
        ok = cap.grab()
        if not ok:
            break
        t = idx / native
        if t > max_s:
            break
        if idx % step:
            idx += 1
            continue
        ok, frame = cap.retrieve()
        idx += 1
        if not ok or frame is None:
            continue
        h, w = frame.shape[:2]
        scale = W / float(w)
        small = cv2.resize(frame, (W, max(2, int(h * scale))), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        if prev is None:
            prev = gray
            continue
        rec = {"t": round(t, 3), "s": 1.0, "tx": 0.0, "ty": 0.0, "ok": False}
        p0 = cv2.goodFeaturesToTrack(prev, maxCorners=300, qualityLevel=0.01, minDistance=7)
        if p0 is not None and len(p0) >= 20:
            p1, st, _err = cv2.calcOpticalFlowPyrLK(prev, gray, p0, None, winSize=(21, 21), maxLevel=3)
            if p1 is not None:
                good0 = p0[st.flatten() == 1]
                good1 = p1[st.flatten() == 1]
                if len(good0) >= 20:
                    m, inl = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if m is not None and inl is not None:
                        ratio = float(inl.sum()) / float(len(inl))
                        a, b = float(m[0, 0]), float(m[1, 0])
                        s = math.hypot(a, b)
                        # muito poucos pontos concordam: corte de cena ou tudo se mexendo
                        if ratio >= 0.5 and 0.6 < s < 1.6:
                            rec = {
                                "t": round(t, 3),
                                "s": round(s, 5),
                                "tx": round(float(m[0, 2]) / W, 5),
                                "ty": round(float(m[1, 2]) / W, 5),
                                "ok": True,
                            }
        samples.append(rec)
        prev = gray
    cap.release()
    if not samples:
        print("vídeo sem quadros legíveis", file=sys.stderr)
        return 5
    json.dump({"fps": round(fps, 4), "width": width, "height": height, "samples": samples}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
