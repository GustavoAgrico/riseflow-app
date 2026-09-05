#!/usr/bin/env python3
"""Rastreia o sujeito de um vídeo para reframe inteligente.

Uso: python3 track_subject.py <video> [sample_fps]
Saída (stdout, JSON): {"inW","inH","duration","points":[{"t","x","y","src"}]}
  x,y são o centro do sujeito normalizado (0–1). src: "face" | "motion".

Estratégia: detecção de rosto (Haar frontal + perfil); onde não há rosto, usa o
centroide de movimento (diferença entre frames). Requer opencv-python-headless.
Se o OpenCV/vídeo não abrir, sai com código != 0 e o chamador cai para crop central.
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("uso: track_subject.py <video> [sample_fps]\n")
        return 2
    video = sys.argv[1]
    sample_fps = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0

    try:
        import cv2  # numpy vem junto como dependência do opencv
    except ImportError:
        sys.stderr.write("opencv indisponível\n")
        return 3

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        sys.stderr.write("não foi possível abrir o vídeo\n")
        return 4

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    in_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    in_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = total / fps if total and fps else 0
    step = max(1, int(round(fps / sample_fps)))

    haar = cv2.data.haarcascades
    frontal = cv2.CascadeClassifier(haar + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(haar + "haarcascade_profileface.xml")

    # trabalha numa resolução reduzida (rápido); resultados normalizados
    proc_w = 320
    points = []
    prev_small = None
    idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step != 0:
            idx += 1
            continue
        t = idx / fps
        h, w = frame.shape[:2]
        scale = proc_w / w
        small = cv2.resize(frame, (proc_w, max(1, int(h * scale))))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        faces = frontal.detectMultiScale(gray, 1.15, 5, minSize=(24, 24))
        if len(faces) == 0:
            faces = profile.detectMultiScale(gray, 1.15, 5, minSize=(24, 24))

        if len(faces) > 0:
            # maior rosto
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            cx = (fx + fw / 2) / small.shape[1]
            cy = (fy + fh / 2) / small.shape[0]
            points.append({"t": round(t, 3), "x": round(cx, 4), "y": round(cy, 4), "src": "face"})
        elif prev_small is not None:
            diff = cv2.absdiff(gray, prev_small)
            _, thr = cv2.threshold(diff, 22, 255, cv2.THRESH_BINARY)
            m = cv2.moments(thr, binaryImage=True)
            # m00 = nº de pixels em movimento; exige ao menos ~1% do quadro
            if m["m00"] > (thr.shape[0] * thr.shape[1] * 0.01):
                cx = (m["m10"] / m["m00"]) / small.shape[1]
                cy = (m["m01"] / m["m00"]) / small.shape[0]
                points.append({"t": round(t, 3), "x": round(cx, 4), "y": round(cy, 4), "src": "motion"})

        prev_small = gray
        idx += 1

    cap.release()
    print(json.dumps({"inW": in_w, "inH": in_h, "duration": round(duration, 3), "points": points}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
