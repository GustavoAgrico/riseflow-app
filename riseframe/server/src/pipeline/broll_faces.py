#!/usr/bin/env python3
"""Acha os rostos de uma imagem (ou de um quadro de vídeo) do B-roll.

Uso: python3 broll_faces.py <arquivo> [segundo_do_video]
Saída (stdout, JSON):
  {"w", "h", "aspect", "faces": [{"x", "y", "w", "h"}]}   # rostos normalizados (0–1)

Serve para o enquadramento automático: o recorte que cobre a área do B-roll é posicionado
para a cabeça caber inteira (ver shared/brollFocus.js). Haar frontal + perfil (os dois
lados), como o rastreador do reframe. Requer opencv-python-headless; sem ele, sai com
código != 0 e o chamador fica com o enquadramento padrão.
"""
import json
import sys


def overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    return ix * iy / float(min(aw * ah, bw * bh) or 1)


def read_frame(cv2, path, at):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is not None:
        return img
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, at) * 1000.0)
    ok, frame = cap.read()
    if not ok or frame is None:  # vídeo curto demais para o segundo pedido: 1º quadro
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()
    cap.release()
    return frame if ok else None


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: broll_faces.py <arquivo> [segundo]", file=sys.stderr)
        return 2
    try:
        import cv2
    except Exception as err:  # noqa: BLE001
        print(f"opencv indisponível: {err}", file=sys.stderr)
        return 3
    if not hasattr(cv2, "CascadeClassifier"):  # OpenCV 5 tirou o Haar do pacote principal
        print("opencv sem CascadeClassifier (use opencv-python-headless 4.x)", file=sys.stderr)
        return 3
    at = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    img = read_frame(cv2, sys.argv[1], at)
    if img is None:
        print("não abriu a imagem/vídeo", file=sys.stderr)
        return 4
    h, w = img.shape[:2]
    # trabalha numa cópia de até 640 px no lado maior (rápido e suficiente para rosto)
    k = min(1.0, 640.0 / max(w, h))
    small = cv2.resize(img, (max(1, int(w * k)), max(1, int(h * k))), interpolation=cv2.INTER_AREA) if k < 1 else img
    gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    sh, sw = gray.shape[:2]
    min_side = max(20, int(min(sw, sh) * 0.06))
    haar = cv2.data.haarcascades
    frontal = cv2.CascadeClassifier(haar + "haarcascade_frontalface_default.xml")
    profile = cv2.CascadeClassifier(haar + "haarcascade_profileface.xml")
    found = [tuple(int(v) for v in f) for f in frontal.detectMultiScale(gray, 1.1, 5, minSize=(min_side, min_side))]
    if not profile.empty():
        for f in profile.detectMultiScale(gray, 1.1, 5, minSize=(min_side, min_side)):
            f = tuple(int(v) for v in f)
            if all(overlap(f, g) < 0.3 for g in found):
                found.append(f)
        flipped = cv2.flip(gray, 1)
        for (fx, fy, fw, fh) in profile.detectMultiScale(flipped, 1.1, 5, minSize=(min_side, min_side)):
            f = (int(sw - fx - fw), int(fy), int(fw), int(fh))
            if all(overlap(f, g) < 0.3 for g in found):
                found.append(f)
    faces = [
        {"x": round(x / sw, 4), "y": round(y / sh, 4), "w": round(fw / sw, 4), "h": round(fh / sh, 4)}
        for (x, y, fw, fh) in found
    ]
    json.dump({"w": w, "h": h, "aspect": round(w / float(h), 5), "faces": faces}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
