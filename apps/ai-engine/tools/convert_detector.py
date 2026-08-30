"""Export the CMMD YOLO detector (.pt) to ONNX for the sidecar cascade backend.

Run in an env with ultralytics installed (e.g. conda `yolo`), from apps/ai-engine:
    python tools/convert_detector.py --out app/models/detector_yolo.onnx

Uses nms=True so the ONNX graph already emits final [x1,y1,x2,y2,score,class]
detections in the letterboxed 1280 frame — the sidecar only has to un-letterbox.
"""
from __future__ import annotations

import argparse
import os
import shutil

from ultralytics import YOLO

DEFAULT_WEIGHTS = os.path.expanduser("~/IC/yolo_aug_small/cmmd_yolo_aug_runs/best_yolo11n_aug.pt")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", default=DEFAULT_WEIGHTS)
    ap.add_argument("--imgsz", type=int, default=1280)
    ap.add_argument("--opset", type=int, default=12)
    ap.add_argument("--out", default="models/detector_yolo.onnx")
    opt = ap.parse_args()

    model = YOLO(opt.weights)
    try:
        path = model.export(format="onnx", imgsz=opt.imgsz, opset=opt.opset,
                            nms=True, simplify=True)
    except TypeError:
        # older ultralytics without nms= kw: export raw and decode in the backend
        print("WARN: nms=True unsupported; exporting raw head (backend must decode)")
        path = model.export(format="onnx", imgsz=opt.imgsz, opset=opt.opset, simplify=True)

    os.makedirs(os.path.dirname(opt.out), exist_ok=True)
    shutil.copy(path, opt.out)
    print("names:", model.names)
    print("exported:", path, "->", opt.out)


if __name__ == "__main__":
    main()
