#!/usr/bin/env python3
"""Rastreia o sujeito de um vídeo para reframe inteligente.

Uso: python3 track_subject.py <video> [sample_fps]
Saída (stdout, JSON):
  {"inW","inH","duration",
   "points":[{"t","x","y","src"}],          # centro do sujeito principal (0–1)
   "samples":[{"t","faces":[{"x","y","w","h","act"}]}]}  # todos os rostos da amostra
  x,y = centro normalizado (0–1); w,h = tamanho do rosto (fração do quadro).
  src: "face" | "motion". act: movimento da BOCA (0–1) desde a amostra anterior,
  descontado o movimento da cabeça — é o que indica quem está falando.

Estratégia: detecção de rosto (Haar frontal + perfil); onde não há rosto, usa o
centroide de movimento (diferença entre frames). Requer opencv-python-headless.
Se o OpenCV/vídeo não abrir, sai com código != 0 e o chamador cai para crop central.
"""
import json
import sys


def overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    return ix * iy / float(min(aw * ah, bw * bh) or 1)


def region_diff(cv2, gray, prev, x0, y0, x1, y1):
    """Diferença média (0–1) de uma região entre a amostra atual e a anterior."""
    h, w = gray.shape[:2]
    x0, x1 = max(0, int(x0)), min(w, int(x1))
    y0, y1 = max(0, int(y0)), min(h, int(y1))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return 0.0
    d = cv2.absdiff(gray[y0:y1, x0:x1], prev[y0:y1, x0:x1])
    return float(d.mean()) / 255.0


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("uso: track_subject.py <video> [sample_fps]\n")
        return 2
    video = sys.argv[1]
    sample_fps = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0

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

    # trabalha numa resolução reduzida (rápido); resultados normalizados. 480 px de
    # largura ainda acha rostos pequenos de podcast com duas pessoas em 16:9.
    proc_w = 480
    points = []
    samples = []
    prev_small = None
    idx = 0

    while True:
        # quadros fora da amostra: só avança (grab não converte a imagem — bem mais rápido)
        if idx % step != 0:
            if not cap.grab():
                break
            idx += 1
            continue
        ok, frame = cap.read()
        if not ok:
            break
        t = idx / fps
        h, w = frame.shape[:2]
        scale = proc_w / w
        small = cv2.resize(frame, (proc_w, max(1, int(h * scale))))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        sw, sh = small.shape[1], small.shape[0]

        min_side = max(20, int(sw * 0.035))
        found = list(frontal.detectMultiScale(gray, 1.12, 5, minSize=(min_side, min_side)))
        # perfil (dos dois lados: o classificador só conhece um, então espelha) — só se
        # faltar alguém de frente (é a parte mais lenta)
        if len(found) < 2:
            prof = list(profile.detectMultiScale(gray, 1.12, 5, minSize=(min_side, min_side)))
            flipped = cv2.flip(gray, 1)
            for (fx, fy, fw, fh) in profile.detectMultiScale(flipped, 1.12, 5, minSize=(min_side, min_side)):
                prof.append((sw - fx - fw, fy, fw, fh))
            for p in prof:
                if all(overlap(p, f) < 0.3 for f in found):
                    found.append(p)
        found.sort(key=lambda f: f[2] * f[3], reverse=True)
        faces = []
        for f in found:
            if len(faces) >= 3:
                break
            # descarta rostos minúsculos perto de um grande (falsos positivos de fundo)
            if faces and f[2] * f[3] < faces[0]["_a"] * 0.12:
                continue
            if any(overlap(f, (g["_x"], g["_y"], g["_w"], g["_h"])) > 0.3 for g in faces):
                continue
            fx, fy, fw, fh = [int(v) for v in f]
            act = 0.0
            if prev_small is not None:
                # boca = terço de baixo do rosto; testa/olhos = terço de cima. Fala mexe
                # a boca muito mais que o resto; mexer a cabeça mexe tudo por igual.
                mouth = region_diff(cv2, gray, prev_small, fx + fw * 0.22, fy + fh * 0.66, fx + fw * 0.78, fy + fh * 0.98)
                upper = region_diff(cv2, gray, prev_small, fx + fw * 0.2, fy + fh * 0.12, fx + fw * 0.8, fy + fh * 0.45)
                act = max(0.0, mouth - upper * 0.8)
            faces.append({
                "_x": fx, "_y": fy, "_w": fw, "_h": fh, "_a": fw * fh,
                "x": round((fx + fw / 2) / sw, 4),
                "y": round((fy + fh / 2) / sh, 4),
                "w": round(fw / sw, 4),
                "h": round(fh / sh, 4),
                "act": round(act, 5),
            })
        for f in faces:
            for k in ("_x", "_y", "_w", "_h", "_a"):
                f.pop(k, None)
        samples.append({"t": round(t, 3), "faces": faces})

        if faces:
            # maior rosto
            points.append({"t": round(t, 3), "x": faces[0]["x"], "y": faces[0]["y"], "src": "face"})
        elif prev_small is not None:
            diff = cv2.absdiff(gray, prev_small)
            _, thr = cv2.threshold(diff, 22, 255, cv2.THRESH_BINARY)
            m = cv2.moments(thr, binaryImage=True)
            # m00 = nº de pixels em movimento; exige ao menos ~1% do quadro
            if m["m00"] > (thr.shape[0] * thr.shape[1] * 0.01):
                cx = (m["m10"] / m["m00"]) / sw
                cy = (m["m01"] / m["m00"]) / sh
                points.append({"t": round(t, 3), "x": round(cx, 4), "y": round(cy, 4), "src": "motion"})

        prev_small = gray
        idx += 1

    cap.release()
    print(json.dumps({"inW": in_w, "inH": in_h, "duration": round(duration, 3), "points": points, "samples": samples}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
