#!/usr/bin/env python3
"""Bateria de avaliação técnica — Spec 004.

Mede a aplicação integrada ponta a ponta contra o Go Core em 127.0.0.1:8088.
Emite CSV bruto (rastreabilidade) e um resumo em texto.

Uso:  python3 bateria.py <saida.csv>
"""
from __future__ import annotations
import json, statistics, subprocess, sys, time, urllib.request, csv, os

BASE = "http://127.0.0.1:8088"
REPS = 5   # repetições de inferência por imagem

IMGS = [
    ("R-CC",  "MG real", "<pasta do exame>/<incidência>"),
    ("L-CC",  "MG real", "<pasta do exame>/<incidência>"),
    ("R-MLO", "MG real", "<pasta do exame>/<incidência>"),
    ("L-MLO", "MG real", "<pasta do exame>/<incidência>"),
    ("JPEG-LS a", "fixture comprimido", os.path.abspath("apps/core/internal/adapters/filesystem/testdata/jpegls_lossless.dcm")),
    ("JPEG-LS b", "fixture comprimido", os.path.abspath("apps/core/internal/adapters/filesystem/testdata/jpegls_reference.dcm")),
]


def post(path: str, body: dict, timeout=600):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        payload = json.loads(r.read())
    return payload, (time.perf_counter() - t0) * 1000


def get_ms(path: str, timeout=600):
    t0 = time.perf_counter()
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        n = len(r.read())
    return (time.perf_counter() - t0) * 1000, n


def main(out_csv: str):
    rows = []
    print(f"{'imagem':<12} {'dims':>12} {'abrir':>9} {'render':>9} "
          f"{'inferência (ms)':>26} {'achados':>28}")
    print("-" * 105)

    for label, tipo, path in IMGS:
        study, t_open = post("/api/studies", {"file_path": path})
        sid = study["id"]
        w, h = study.get("columns", 0), study.get("height", 0)

        t_render, png_bytes = get_ms(f"/api/studies/{sid}/preview")

        lat, findings = [], None
        for _ in range(REPS):
            resp, ms = post("/api/tasks/predict", {"image_path": path, "study_id": sid})
            lat.append(ms)
            findings = resp["findings"]

        located = [f for f in findings if f.get("bbox")]
        assessments = [f for f in findings if not f.get("bbox")]
        # A cascata devolve P(maligno) na confiança do achado nível-imagem.
        prob = assessments[0]["confidence"] if assessments else None
        gate_open = len(located) > 0 or (
            assessments and "gate fechado" not in assessments[0].get("notes", ""))

        desc = (", ".join(f"{f['kind']}({f['confidence']:.2f})" for f in findings))[:28]
        print(f"{label:<12} {f'{w}x{h}':>12} {t_open:8.0f}ms {t_render:8.0f}ms "
              f"{statistics.mean(lat):9.0f} ±{statistics.pstdev(lat):<5.0f}      {desc:>28}")

        rows.append({
            "imagem": label, "tipo": tipo, "width": w, "height": h,
            "abrir_ms": round(t_open), "render_ms": round(t_render),
            "preview_bytes": png_bytes,
            "inferencia_media_ms": round(statistics.mean(lat)),
            "inferencia_desvio_ms": round(statistics.pstdev(lat)),
            "inferencia_min_ms": round(min(lat)), "inferencia_max_ms": round(max(lat)),
            "model_id": resp["model_id"],
            "n_achados": len(findings),
            "n_com_caixa": len(located),
            "n_assessment": len(assessments),
            "p_maligno": prob,
            "gate_acionado": bool(gate_open),
            "kinds": "|".join(f["kind"] for f in findings),
        })

    with open(out_csv, "w", newline="") as fh:
        wtr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        wtr.writeheader(); wtr.writerows(rows)

    # ── agregados ────────────────────────────────────────────────────────────
    reais = [r for r in rows if r["tipo"] == "MG real"]
    todas = rows
    lat_reais = [r["inferencia_media_ms"] for r in reais]
    print("\n" + "=" * 60)
    print(f"N total = {len(todas)}  (mamografias reais: {len(reais)})")
    print(f"Latência de inferência, mamografias reais: "
          f"média {statistics.mean(lat_reais):.0f} ms  "
          f"min {min(lat_reais)}  max {max(lat_reais)}")
    print(f"Abertura+registro do estudo: média "
          f"{statistics.mean([r['abrir_ms'] for r in reais]):.0f} ms")
    print(f"Render do preview (PNG com WW/WC): média "
          f"{statistics.mean([r['render_ms'] for r in reais]):.0f} ms")
    acion = sum(1 for r in reais if r["gate_acionado"])
    print(f"Gate acionado em {acion}/{len(reais)} das mamografias reais")
    print(f"Achados com caixa: {sum(r['n_com_caixa'] for r in reais)}")
    print(f"Somente assessment: {sum(1 for r in reais if r['n_com_caixa'] == 0)}/{len(reais)}")
    probs = [r["p_maligno"] for r in reais if r["p_maligno"] is not None]
    if probs:
        print(f"P(maligno): min {min(probs):.3f}  max {max(probs):.3f}  "
              f"média {statistics.mean(probs):.3f}")
    print(f"\nCSV bruto: {out_csv}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bateria.csv")
