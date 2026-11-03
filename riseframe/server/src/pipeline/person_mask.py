#!/usr/bin/env python3
"""Máscara da pessoa (para o texto ficar ATRÁS dela).

Uso: python3 person_mask.py <video> <modelo.onnx> <saida.avi> <janelas_json> <largura> <altura> [passo]
  janelas_json: [[inicio, fim], ...] em segundos — só nelas a pessoa é recortada;
  fora delas a máscara é preta (o texto não aparece fora das janelas mesmo).
  largura/altura: tamanho da máscara (o FFmpeg aumenta depois); passo: recorta 1 a cada N
  quadros e repete a máscara nos outros (mais rápido; a pessoa se move pouco).
Saída: vídeo cinza (branco = pessoa) com o mesmo fps e número de quadros do vídeo.
Progresso no stdout: "p <0..1>". Modelo: U^2-Net human segmentation (Apache 2.0).
Requer opencv-python-headless e onnxruntime.
"""
import json
import sys

import cv2
import numpy as np
import onnxruntime as ort

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
MARGIN = 0.15  # s antes/depois de cada janela (o texto entra com fade)


def predict(sess, name, frame):
    """Máscara 0..1 (float32) do tamanho do quadro."""
    h, w = frame.shape[:2]
    img = cv2.cvtColor(cv2.resize(frame, (320, 320), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32)
    img = img / max(1.0, float(img.max()))
    img = (img - MEAN) / STD
    out = sess.run(None, {name: img.transpose(2, 0, 1)[None]})[0][0, 0]
    lo, hi = float(out.min()), float(out.max())
    out = (out - lo) / (hi - lo) if hi > lo else out * 0
    return cv2.resize(out.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)


def main():
    video, model, out_path, windows_json = sys.argv[1:5]
    ow, oh = int(sys.argv[5]), int(sys.argv[6])
    step = max(1, int(sys.argv[7])) if len(sys.argv) > 7 else 2
    windows = [(float(a) - MARGIN, float(b) + MARGIN) for a, b in json.loads(windows_json)]
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        sys.exit(2)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 0
    sess = ort.InferenceSession(model, sess_options=opts, providers=['CPUExecutionProvider'])
    name = sess.get_inputs()[0].name
    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*'MJPG'), fps, (ow, oh), True)
    writer.set(cv2.VIDEOWRITER_PROP_QUALITY, 95)
    black = np.zeros((oh, ow, 3), dtype=np.uint8)
    last = None
    prev = None
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = i / fps
        if any(a <= t <= b for a, b in windows):
            if last is None or i % step == 0:
                m = predict(sess, name, cv2.resize(frame, (ow, oh), interpolation=cv2.INTER_AREA))
                # menos tremido: mistura com a máscara anterior; borda macia
                if prev is not None:
                    m = 0.65 * m + 0.35 * prev
                prev = m
                m = np.clip((m - 0.25) / 0.5, 0, 1)
                m = cv2.GaussianBlur(m, (5, 5), 0)
                last = cv2.cvtColor((m * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
            writer.write(last)
        else:
            last = None
            prev = None
            writer.write(black)
        i += 1
        if i % 15 == 0:
            print(f'p {min(1.0, i / total):.3f}', flush=True)
    writer.release()
    cap.release()
    print(json.dumps({'frames': i, 'fps': fps}), flush=True)


if __name__ == '__main__':
    main()
