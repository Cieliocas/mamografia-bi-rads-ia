import {
  Component, ElementRef, ViewChild, HostListener, inject, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Hand, Target, Ruler, ZoomOut, ZoomIn, Maximize2 } from 'lucide-angular';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService } from '../../core/services/study.service';
import {
  VP, ROI, RulerLine, Ix,
  biradsColor, rgba, d2, clone
} from '../../shared/models/types';

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './viewer.component.html',
})
export class ViewerComponent implements AfterViewInit {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);

  readonly icons = { Hand, Target, Ruler, ZoomOut, ZoomIn, Maximize2 };

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('c0', { static: false }) c0?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ct0', { static: false }) ct0?: ElementRef<HTMLDivElement>;
  @ViewChild('c1', { static: false }) c1?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ct1', { static: false }) ct1?: ElementRef<HTMLDivElement>;

  ngAfterViewInit() {}

  // ── Canvas refs ────────────────────────────────────────────────────────────
  private cv(i: number) { return i === 0 ? this.c0?.nativeElement : this.c1?.nativeElement; }
  private ct(i: number) { return i === 0 ? this.ct0?.nativeElement : this.ct1?.nativeElement; }

  // ── File loading ───────────────────────────────────────────────────────────
  openFileDialog(vpIdx = this.state.activeVp) {
    this.state.pendingVp = vpIdx;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const vpIdx = this.state.pendingVp;
    this.study.loadFile(file, vpIdx, this.state.vp[vpIdx], (idx) => {
      this.resetVP(idx);
      this.state.clearAll(idx, false, (i) => this.draw(i));
      setTimeout(() => this.draw(idx), 50);
    });
    input.value = '';
  }

  loadHistory(entry: { name: string; dataUrl: string }) {
    const vpIdx = this.state.activeVp;
    this.study.loadHistoryEntry(entry as any, vpIdx, this.state.vp[vpIdx], (idx) => {
      this.resetVP(idx);
      this.state.clearAll(idx, false, (i) => this.draw(i));
      setTimeout(() => this.draw(idx), 50);
    });
    this.state.activePanel = 'images';
  }

  // ── Viewport reset ─────────────────────────────────────────────────────────
  resetVP(vpIdx: number) {
    const vp = this.state.vp[vpIdx];
    const ct = this.ct(vpIdx);
    vp.zoom = 1; vp.panX = 0; vp.panY = 0; vp.contrast = 80; vp.brightness = 100;
    if (vp.loadedImage && ct) {
      vp.zoom = Math.min(
        ct.clientWidth / vp.loadedImage.naturalWidth,
        ct.clientHeight / vp.loadedImage.naturalHeight
      ) * 0.9;
    }
  }

  // ── Zoom / fit ─────────────────────────────────────────────────────────────
  zoomIn(vpIdx = this.state.activeVp) { this.state.zoomIn(vpIdx, (i) => this.draw(i)); }
  zoomOut(vpIdx = this.state.activeVp) { this.state.zoomOut(vpIdx, (i) => this.draw(i)); }
  fitScreen(vpIdx = this.state.activeVp) { this.resetVP(vpIdx); this.draw(vpIdx); }
  onContrastChange(vpIdx = this.state.activeVp) { this.draw(vpIdx); }

  // ── Draw ───────────────────────────────────────────────────────────────────
  draw(vpIdx: number) {
    const canvas = this.cv(vpIdx);
    const ct = this.ct(vpIdx);
    const vp = this.state.vp[vpIdx];
    if (!canvas || !ct) return;
    canvas.width = ct.clientWidth;
    canvas.height = ct.clientHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (vp.loadedImage) {
      ctx.save();
      ctx.filter = `contrast(${vp.contrast}%) brightness(${vp.brightness}%)`;
      const cx = canvas.width / 2 + vp.panX;
      const cy = canvas.height / 2 + vp.panY;
      ctx.translate(cx, cy);
      ctx.scale(vp.zoom, vp.zoom);
      const img = vp.loadedImage;
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2, img.naturalWidth, img.naturalHeight);
      ctx.restore();
    }

    const ix = this.state.ix;
    const tROI = ix?.vpIdx === vpIdx && ix.mode === 'draw-roi' ? ix.tempROI : null;
    const tRuler = ix?.vpIdx === vpIdx && ix.mode === 'draw-ruler' ? ix.tempRuler : null;
    this.drawROIs(ctx, canvas.width, canvas.height, vp, tROI);
    this.drawRulers(ctx, canvas.width, canvas.height, vp, tRuler);
  }

  private drawROIs(ctx: CanvasRenderingContext2D, cw: number, ch: number, vp: VP, temp: ROI|null) {
    const all = [...vp.rois, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(roi => {
      if (!vp.loadedImage) return;
      const c = this.i2s(vp, roi.x, roi.y, cw, ch);
      const srx = Math.max(2, roi.rx * vp.zoom);
      const sry = Math.max(2, roi.ry * vp.zoom);
      const col = roi.isSelected ? '#afa2ff' : biradsColor(roi.birads);
      ctx.strokeStyle = col; ctx.lineWidth = roi.isSelected ? 2.5 : 1.8;
      ctx.fillStyle = rgba(col, roi.isSelected ? 0.18 : 0.11);
      ctx.beginPath();
      if (roi.shape === 'ellipse') ctx.ellipse(c.x, c.y, srx, sry, 0, 0, Math.PI * 2);
      else ctx.rect(c.x - srx, c.y - sry, srx * 2, sry * 2);
      ctx.fill(); ctx.stroke();
      if (roi.isSelected) {
        ctx.save(); ctx.strokeStyle = '#afa2ff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath();
        if (roi.shape === 'ellipse') ctx.ellipse(c.x, c.y, srx + 5, sry + 5, 0, 0, Math.PI * 2);
        else ctx.rect(c.x - srx - 5, c.y - sry - 5, (srx + 5) * 2, (sry + 5) * 2);
        ctx.stroke(); ctx.restore();
      }
      if (roi.id > 0) {
        ctx.fillStyle = col;
        ctx.font = `bold ${Math.max(9, Math.min(12, 11 * vp.zoom))}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(roi.label || (roi.birads ? `BI-RADS ${roi.birads}` : `ROI #${roi.id}`), c.x, c.y - sry - 5);
      }
    });
    ctx.restore();
  }

  private drawRulers(ctx: CanvasRenderingContext2D, cw: number, ch: number, vp: VP, temp: RulerLine|null) {
    const all = [...vp.rulers, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(ru => {
      if (!vp.loadedImage) return;
      const a = this.i2s(vp, ru.x1, ru.y1, cw, ch);
      const b = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      const dist = Math.sqrt((ru.x2 - ru.x1) ** 2 + (ru.y2 - ru.y1) ** 2).toFixed(1);
      const col = ru.isSelected ? '#afa2ff' : '#7b9fff';
      ctx.strokeStyle = col; ctx.lineWidth = ru.isSelected ? 2 : 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      [a, b].forEach(pt => {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, ru.isSelected ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
      });
      ctx.fillStyle = col;
      ctx.font = 'bold 11px Inter,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${dist}px`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 9);
    });
    ctx.restore();
  }

  // ── Coordinate transforms ──────────────────────────────────────────────────
  private i2s(vp: VP, ix: number, iy: number, cw: number, ch: number) {
    const cx = cw / 2 + vp.panX;
    const cy = ch / 2 + vp.panY;
    const img = vp.loadedImage!;
    return { x: cx + (ix - img.naturalWidth / 2) * vp.zoom, y: cy + (iy - img.naturalHeight / 2) * vp.zoom };
  }

  private s2i(e: MouseEvent, vpIdx: number) {
    const canvas = this.cv(vpIdx)!;
    const vp = this.state.vp[vpIdx];
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const cx = canvas.width / 2 + vp.panX, cy = canvas.height / 2 + vp.panY;
    const img = vp.loadedImage!;
    return { x: (sx - cx) / vp.zoom + img.naturalWidth / 2, y: (sy - cy) / vp.zoom + img.naturalHeight / 2 };
  }

  private screenXY(e: MouseEvent, vpIdx: number) {
    const r = this.cv(vpIdx)!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ── Hit testing ────────────────────────────────────────────────────────────
  private hitROI(vp: VP, ix: number, iy: number): ROI|null {
    for (let i = vp.rois.length - 1; i >= 0; i--) {
      const r = vp.rois[i];
      if (r.shape === 'ellipse') {
        const dx = (ix - r.x) / (r.rx || 1), dy = (iy - r.y) / (r.ry || 1);
        if (dx * dx + dy * dy <= 1.4) return r;
      } else {
        if (Math.abs(ix - r.x) <= r.rx * 1.4 && Math.abs(iy - r.y) <= r.ry * 1.4) return r;
      }
    }
    return null;
  }

  private hitRuler(vp: VP, canvas: HTMLCanvasElement, sx: number, sy: number) {
    const cw = canvas.width, ch = canvas.height;
    for (let i = vp.rulers.length - 1; i >= 0; i--) {
      const ru = vp.rulers[i];
      const a = this.i2s(vp, ru.x1, ru.y1, cw, ch);
      const b = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      if (d2(sx, sy, a.x, a.y) <= 9) return { i, ep: 'start' as const };
      if (d2(sx, sy, b.x, b.y) <= 9) return { i, ep: 'end' as const };
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / l2));
      if (d2(sx, sy, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)) <= 7) return { i, ep: 'full' as const };
    }
    return null;
  }

  // ── Mouse events ───────────────────────────────────────────────────────────
  onMouseDown(e: MouseEvent, vpIdx: number) {
    this.state.activeVp = vpIdx;
    const vp = this.state.vp[vpIdx];
    if (!vp.loadedImage) return;
    e.preventDefault();

    const img = this.s2i(e, vpIdx);
    const sc = this.screenXY(e, vpIdx);
    const canvas = this.cv(vpIdx)!;

    if (this.state.activeTool === 'pan') {
      this.state.ix = {
        vpIdx, mode: 'pan', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: null
      };
      return;
    }

    if (this.state.activeTool === 'ruler') {
      const hit = this.hitRuler(vp, canvas, sc.x, sc.y);
      if (hit) {
        this.state.snap(vpIdx);
        vp.rulers.forEach(r => r.isSelected = r.id === vp.rulers[hit.i].id);
        this.state.ix = {
          vpIdx,
          mode: hit.ep === 'start' ? 'move-ruler-start' : hit.ep === 'end' ? 'move-ruler-end' : 'move-ruler-full',
          imgX0: img.x, imgY0: img.y, clientX0: e.clientX, clientY0: e.clientY,
          panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0, rulerIdx: hit.i,
          rx1: vp.rulers[hit.i].x1, ry1: vp.rulers[hit.i].y1,
          rx2: vp.rulers[hit.i].x2, ry2: vp.rulers[hit.i].y2,
          tempROI: null, tempRuler: null
        };
        this.draw(vpIdx); return;
      }
      const tempR: RulerLine = { id: -1, x1: img.x, y1: img.y, x2: img.x, y2: img.y, isSelected: false };
      vp.rulers.forEach(r => r.isSelected = false);
      this.state.ix = {
        vpIdx, mode: 'draw-ruler', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: tempR
      };
      return;
    }

    if (this.state.activeTool === 'roi') {
      const hit = this.hitROI(vp, img.x, img.y);
      if (hit) {
        if (hit.id === vp.selectedROIId) {
          this.state.snap(vpIdx);
          this.state.ix = {
            vpIdx, mode: 'move-roi', imgX0: img.x, imgY0: img.y,
            clientX0: e.clientX, clientY0: e.clientY,
            panX0: vp.panX, panY0: vp.panY, roiX0: hit.x, roiY0: hit.y,
            rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: null
          };
          return;
        }
        this.state.selectROI(vpIdx, hit.id, (i) => this.draw(i)); return;
      }
      vp.rois.forEach(r => r.isSelected = false);
      vp.selectedROIId = null; this.state.selectedROI = null;
      const tROI: ROI = {
        id: -1, x: img.x, y: img.y, rx: 0, ry: 0,
        shape: this.state.activeShape, birads: null, label: '', notes: '', isSelected: false
      };
      this.state.ix = {
        vpIdx, mode: 'draw-roi', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: img.x, roiY0: img.y,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: tROI, tempRuler: null
      };
    }
  }

  onMouseMove(e: MouseEvent, vpIdx: number) {
    const ix = this.state.ix;
    if (!ix || ix.vpIdx !== vpIdx) return;
    const vp = this.state.vp[vpIdx];
    const img = this.s2i(e, vpIdx);

    if (ix.mode === 'pan') {
      vp.panX = ix.panX0 + (e.clientX - ix.clientX0);
      vp.panY = ix.panY0 + (e.clientY - ix.clientY0);
      this.draw(vpIdx); return;
    }
    if (ix.mode === 'draw-roi' && ix.tempROI) {
      const dx = Math.abs(img.x - ix.imgX0) / 2, dy = Math.abs(img.y - ix.imgY0) / 2;
      ix.tempROI.x = (img.x + ix.imgX0) / 2; ix.tempROI.y = (img.y + ix.imgY0) / 2;
      ix.tempROI.rx = dx || 1; ix.tempROI.ry = dy || 1;
      this.draw(vpIdx); return;
    }
    if (ix.mode === 'draw-ruler' && ix.tempRuler) {
      ix.tempRuler.x2 = img.x; ix.tempRuler.y2 = img.y;
      this.draw(vpIdx); return;
    }
    if (ix.mode === 'move-roi') {
      const roi = vp.rois.find(r => r.id === vp.selectedROIId);
      if (roi) {
        roi.x = ix.roiX0 + (img.x - ix.imgX0);
        roi.y = ix.roiY0 + (img.y - ix.imgY0);
        if (this.state.selectedROI?.id === roi.id) this.state.selectedROI = { ...roi };
        this.draw(vpIdx);
      } return;
    }
    if (ix.mode === 'move-ruler-full') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) {
        const dx = img.x - ix.imgX0, dy = img.y - ix.imgY0;
        ru.x1 = ix.rx1 + dx; ru.y1 = ix.ry1 + dy; ru.x2 = ix.rx2 + dx; ru.y2 = ix.ry2 + dy;
        this.draw(vpIdx);
      } return;
    }
    if (ix.mode === 'move-ruler-start') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) { ru.x1 = img.x; ru.y1 = img.y; this.draw(vpIdx); } return;
    }
    if (ix.mode === 'move-ruler-end') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) { ru.x2 = img.x; ru.y2 = img.y; this.draw(vpIdx); }
    }
  }

  onMouseUp(e: MouseEvent, vpIdx: number) {
    const ix = this.state.ix;
    if (!ix || ix.vpIdx !== vpIdx) return;
    const vp = this.state.vp[vpIdx];
    const img = this.s2i(e, vpIdx);

    if (ix.mode === 'draw-roi' && ix.tempROI) {
      const dx = Math.abs(img.x - ix.imgX0) / 2, dy = Math.abs(img.y - ix.imgY0) / 2;
      if (dx > 4 || dy > 4) {
        this.state.snap(vpIdx);
        const n: ROI = {
          id: vp.roiCounter++,
          x: (img.x + ix.imgX0) / 2, y: (img.y + ix.imgY0) / 2,
          rx: Math.max(dx, 6), ry: Math.max(dy, 6),
          shape: this.state.activeShape, birads: null, label: '', notes: '', isSelected: true
        };
        vp.rois.forEach(r => r.isSelected = false);
        vp.rois.push(n); vp.selectedROIId = n.id; this.state.selectedROI = n;
        if (!this.state.rightOpen) this.state.rightOpen = true;
      }
    }
    if (ix.mode === 'draw-ruler' && ix.tempRuler) {
      if (Math.sqrt((img.x - ix.imgX0) ** 2 + (img.y - ix.imgY0) ** 2) > 5) {
        this.state.snap(vpIdx);
        vp.rulers.push({ id: vp.rulerCounter++, x1: ix.imgX0, y1: ix.imgY0, x2: img.x, y2: img.y, isSelected: false });
      }
    }
    this.state.ix = null;
    this.draw(vpIdx);
  }

  onMouseEnter(vpIdx: number) { this.state.activeVp = vpIdx; }

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  @HostListener('window:wheel', ['$event'])
  onWheel(e: WheelEvent) {
    const c0 = this.cv(0), c1 = this.cv(1);
    let vpIdx = -1;
    if (c0 && e.target === c0) vpIdx = 0;
    else if (c1 && e.target === c1) vpIdx = 1;
    if (vpIdx < 0 || !this.state.vp[vpIdx].loadedImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    this.state.vp[vpIdx].zoom = Math.min(Math.max(this.state.vp[vpIdx].zoom * delta, 0.03), 12);
    this.draw(vpIdx);
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  get cursorClass(): string {
    const { activeTool, ix } = this.state;
    if (activeTool === 'pan') return ix?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab';
    if (activeTool === 'roi') {
      if (ix?.mode === 'move-roi') return 'cursor-move';
      return ix?.mode === 'draw-roi' ? 'cursor-crosshair' : 'cursor-cell';
    }
    if (activeTool === 'ruler') return 'cursor-crosshair';
    return 'cursor-default';
  }
}
