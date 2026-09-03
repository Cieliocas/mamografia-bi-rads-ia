"""Convert the frozen INbreast-Hybrid malignancy classifier (.pb) to ONNX and
validate parity against TensorFlow.

Run in a throwaway venv with TF + tf2onnx (tools/requirements-convert.txt), from
apps/ai-engine:
    python tools/convert_classifier.py --out app/models/classifier_hybrid.onnx

Frozen-graph tensors:  input  = input_1:0  (N,1152,896,3)  ·  output = dense_1/Softmax:0 (N,2)
Preprocessing at serving time (in the backend):  pixel*1.0 - 52.18, 3 channels.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

import numpy as np

DEFAULT_PB = os.path.expanduser(
    "~/IC/end2end-all-conv/colab_payload/models/inbreast_vgg16_[512-512-1024]x2_hybrid.pb")
IN_TENSOR = "input_1:0"
OUT_TENSOR = "dense_1/Softmax:0"


def _tf_run(pb: str, x: np.ndarray) -> np.ndarray:
    import tensorflow as tf  # local import: only needed for the parity check
    gd = tf.compat.v1.GraphDef()
    with open(pb, "rb") as f:
        gd.ParseFromString(f.read())
    g = tf.Graph()
    with g.as_default():
        tf.import_graph_def(gd, name="")
    with tf.compat.v1.Session(graph=g) as sess:
        return sess.run(OUT_TENSOR, {IN_TENSOR: x})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pb", default=DEFAULT_PB)
    ap.add_argument("--opset", type=int, default=13)
    ap.add_argument("--out", default="models/classifier_hybrid.onnx")
    ap.add_argument("--tol", type=float, default=1e-3)
    opt = ap.parse_args()
    os.makedirs(os.path.dirname(opt.out), exist_ok=True)

    # 1) convert
    cmd = [sys.executable, "-m", "tf2onnx.convert", "--graphdef", opt.pb,
           "--inputs", IN_TENSOR, "--outputs", OUT_TENSOR,
           "--opset", str(opt.opset), "--output", opt.out]
    print("running:", " ".join(cmd))
    subprocess.check_call(cmd)

    # 2) parity: TF graphdef vs onnxruntime on the same preprocessed inputs
    import onnxruntime as ort
    x = (np.random.rand(2, 1152, 896, 3).astype("float32") * 255.0) - 52.18
    tf_y = _tf_run(opt.pb, x)
    sess = ort.InferenceSession(opt.out, providers=["CPUExecutionProvider"])
    iname = sess.get_inputs()[0].name
    onnx_y = sess.run(None, {iname: x})[0]
    maxdiff = float(np.max(np.abs(np.asarray(tf_y) - np.asarray(onnx_y))))
    print("onnx input name:", iname, "| output shape:", np.asarray(onnx_y).shape)
    print("parity maxdiff (TF vs ONNX):", maxdiff)
    assert maxdiff < opt.tol, f"ONNX parity failed: maxdiff {maxdiff} >= {opt.tol}"
    print("OK ->", opt.out)


if __name__ == "__main__":
    main()
