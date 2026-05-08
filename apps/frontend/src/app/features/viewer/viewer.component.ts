import {
  Component, ElementRef, ViewChild, HostListener, inject, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Hand, Target, Ruler, ZoomOut, ZoomIn, Maximize2,
  ChevronLeft, ChevronRight, Paintbrush, ArrowUpRight,
  Eraser, LayoutGrid
} from 'lucide-angular';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService } from '../../core/services/study.service';
import {
  VP, ROI, RulerLine, BrushStroke, Ix,
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

  readonly icons = {
    Hand, Target, Ruler, ZoomOut, ZoomIn, Maximize2,
    ChevronLeft, ChevronRight, Paintbrush, ArrowUpRight,
    Eraser, LayoutGrid
  };

  @ViewChild('fileInput')  fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('c0',  { static: false }) c0?:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ct0', { static: false }) ct0?: ElementRef<HTMLDivElement>;
  @ViewChild('c1',  { static: false }) c1?:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ct1', { static: false }) ct1?: ElementRef<HTMLDivElement>;
  @ViewChild('c2',  { static: false }) c2?:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ct2', { static: false }) ct2?: ElementRef<HTMLDivElement>;
  @ViewChild('c3',  { static: false }) c3?:  ElementRef<HTMLCanvasElement>;
  @ViewChild('ct3', { static: false }) ct3?: ElementRef<HTMLDivElement>;

  /** Live brush stroke being painted — committed to VP on mouseUp. */
  private tempBrush: { points: { x: number; y: number }[]; color: string } | null = null;

  ngAfterViewInit() {}

  // ── Canvas refs ────────────────────────────────────────────────────────────
  private cv(i: number): HTMLCanvasElement | undefined {
    return [this.c0, this.c1, this.c2, this.c3][i]?.nativeElement;
  }
  private ct(i: number): HTMLDivElement | undefined {
    return [this.ct0, this.ct1, this.ct2, this.ct3][i]?.nativeElement;
  }

  /** True when running inside the Wails desktop shell. */
  private get inWails(): boolean {
    return !!(window as any).go?.main?.App?.OpenFileDialog;
  }

  // ── File loading ───────────────────────────────────────────────────────────
  async openFileDialog(vpIdx = this.state.activeVp) {
    this.state.pendingVp = vpIdx;
    if (this.inWails) {
      const { OpenFileDialog } = await import('../../wailsjs/go/main/App');
      const path = await OpenFileDialog();
      if (path) {
        this.study.loadNativePath(path, vpIdx, this.state.vp[vpIdx], (idx) => {
          this.resetVP(idx);
          this.state.clearAll(idx, false, (i) => this.draw(i));
          setTimeout(() => this.draw(idx), 50);
        });
      }
      return;
    }
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

  /** Open a DICOM/PNG by its absolute filesystem path (native/Wails only). */
  openPath(filePath: string) {
    const vpIdx = this.state.activeVp;
    this.study.loadNativePath(filePath, vpIdx, this.state.vp[vpIdx], (idx) => {
      this.resetVP(idx);
      this.state.clearAll(idx, false, (i) => this.draw(i));
      setTimeout(() => this.draw(idx), 50);
    });
    this.state.activePanel = 'files';
  }

  loadHistory(entry: import('../../core/services/study.service').HistoryEntry) {
    const vpIdx = this.state.activeVp;
    this.study.loadHistoryEntry(entry, vpIdx, this.state.vp[vpIdx],
      (idx) => {
        this.resetVP(idx);
        this.state.clearAll(idx, false, (i) => this.draw(i));
        setTimeout(() => this.draw(idx), 50);
      },
      (rois) => {
        const vp = this.state.vp[vpIdx];
        let counter = 1;
        vp.rois = rois.map(r => ({ ...r, id: counter++ } as import('../../shared/models/types').ROI));
        vp.roiCounter = counter;
        this.draw(vpIdx);
      }
    );
    this.state.activePanel = 'files';
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
  zoomIn(vpIdx = this.state.activeVp)  { this.state.zoomIn(vpIdx,  (i) => this.draw(i)); }
  zoomOut(vpIdx = this.state.activeVp) { this.state.zoomOut(vpIdx, (i) => this.draw(i)); }
  fitScreen(vpIdx = this.state.activeVp) { this.resetVP(vpIdx); this.draw(vpIdx); }
  onContrastChange(vpIdx = this.state.activeVp) { this.draw(vpIdx); }

  // ── Draw ───────────────────────────────────────────────────────────────────
  draw(vpIdx: number) {
    const canvas = this.cv(vpIdx);
    const ct     = this.ct(vpIdx);
    const vp     = this.state.vp[vpIdx];
    if (!canvas || !ct) return;
    canvas.width  = ct.clientWidth;
    canvas.height = ct.clientHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (vp.loadedImage) {
      ctx.save();
      const invertPart = vp.invertColors ? ' invert(100%)' : '';
      ctx.filter = `contrast(${vp.contrast}%) brightness(${vp.brightness}%)${invertPart}`;
      const cx = canvas.width / 2 + vp.panX;
      const cy = canvas.height / 2 + vp.panY;
      ctx.translate(cx, cy);
      ctx.scale(vp.zoom, vp.zoom);
      const img = vp.loadedImage;
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2,
        img.naturalWidth, img.naturalHeight);
      ctx.restore();
    }

    const ix    = this.state.ix;
    const tROI  = ix?.vpIdx === vpIdx && ix.mode === 'draw-roi'   ? ix.tempROI   : null;
    const tRulr = ix?.vpIdx === vpIdx && (ix.mode === 'draw-ruler' || ix.mode === 'draw-arrow') ? ix.tempRuler : null;
    this.drawROIs(ctx, canvas.width, canvas.height, vp, tROI);
    this.drawRulers(ctx, canvas.width, canvas.height, vp, tRulr);
    this.drawBrushStrokes(ctx, canvas.width, canvas.height, vp);
    if (this.tempBrush && ix?.vpIdx === vpIdx) {
      this.drawSingleBrush(ctx, canvas.width, canvas.height, vp, this.tempBrush);
    }
  }

  private drawROIs(ctx: CanvasRenderingContext2D, cw: number, ch: number,
                   vp: VP, temp: ROI|null) {
    const all = [...vp.rois, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(roi => {
      if (!vp.loadedImage) return;
      const c   = this.i2s(vp, roi.x, roi.y, cw, ch);
      const srx = Math.max(2, roi.rx * vp.zoom);
      const sry = Math.max(2, roi.ry * vp.zoom);
      const col = roi.isSelected ? '#afa2ff' : biradsColor(roi.birads);
      ctx.strokeStyle = col; ctx.lineWidth = roi.isSelected ? 2.5 : 1.8;
      ctx.fillStyle   = rgba(col, roi.isSelected ? 0.18 : 0.11);
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
        ctx.fillText(
          roi.label || (roi.birads ? `BI-RADS ${roi.birads}` : `ROI #${roi.id}`),
          c.x, c.y - sry - 5
        );
      }
    });
    ctx.restore();
  }

  private drawRulers(ctx: CanvasRenderingContext2D, cw: number, ch: number,
                     vp: VP, temp: RulerLine|null) {
    const all = [...vp.rulers, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(ru => {
      if (!vp.loadedImage) return;
      const a   = this.i2s(vp, ru.x1, ru.y1, cw, ch);
      const b   = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      const col = ru.isSelected ? '#afa2ff' : (ru.isArrow ? '#ffb340' : '#7b9fff');

      ctx.strokeStyle = col; ctx.lineWidth = ru.isSelected ? 2 : 1.5;
      if (!ru.isArrow) ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);

      if (ru.isArrow) {
        // Draw arrowhead at b
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const hs    = 12;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - hs * Math.cos(angle - 0.45), b.y - hs * Math.sin(angle - 0.45));
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - hs * Math.cos(angle + 0.45), b.y - hs * Math.sin(angle + 0.45));
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        // Small dot at start
        ctx.beginPath(); ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
      } else {
        // Ruler endpoints
        [a, b].forEach(pt => {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, ru.isSelected ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
        });
        const dist = Math.sqrt((ru.x2 - ru.x1) ** 2 + (ru.y2 - ru.y1) ** 2).toFixed(1);
        ctx.fillStyle = col;
        ctx.font = 'bold 11px Inter,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${dist}px`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 9);
      }
    });
    ctx.restore();
  }

  private drawBrushStrokes(ctx: CanvasRenderingContext2D, cw: number, ch: number, vp: VP) {
    if (!vp.loadedImage) return;
    ctx.save();
    vp.brushStrokes.forEach(bs => {
      this.drawSingleBrush(ctx, cw, ch, vp, bs);
    });
    ctx.restore();
  }

  private drawSingleBrush(ctx: CanvasRenderingContext2D, cw: number, ch: number,
                           vp: VP, bs: { points: { x: number; y: number }[]; color: string }) {
    if (!vp.loadedImage || bs.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = bs.color; ctx.lineWidth = Math.max(2, 3 * vp.zoom);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    const p0 = this.i2s(vp, bs.points[0].x, bs.points[0].y, cw, ch);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < bs.points.length; i++) {
      const p = this.i2s(vp, bs.points[i].x, bs.points[i].y, cw, ch);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Coordinate transforms ──────────────────────────────────────────────────
  private i2s(vp: VP, ix: number, iy: number, cw: number, ch: number) {
    const cx  = cw / 2 + vp.panX;
    const cy  = ch / 2 + vp.panY;
    const img = vp.loadedImage!;
    return {
      x: cx + (ix - img.naturalWidth  / 2) * vp.zoom,
      y: cy + (iy - img.naturalHeight / 2) * vp.zoom
    };
  }

  private s2i(e: MouseEvent, vpIdx: number) {
    const canvas = this.cv(vpIdx)!;
    const vp     = this.state.vp[vpIdx];
    const r      = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const cx = canvas.width  / 2 + vp.panX;
    const cy = canvas.height / 2 + vp.panY;
    const img = vp.loadedImage!;
    return { x: (sx - cx) / vp.zoom + img.naturalWidth / 2,
             y: (sy - cy) / vp.zoom + img.naturalHeight / 2 };
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
      const a  = this.i2s(vp, ru.x1, ru.y1, cw, ch);
      const b  = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      if (d2(sx, sy, a.x, a.y) <= 9) return { i, ep: 'start' as const };
      if (d2(sx, sy, b.x, b.y) <= 9) return { i, ep: 'end'   as const };
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1,
        ((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / l2));
      if (d2(sx, sy, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)) <= 7)
        return { i, ep: 'full' as const };
    }
    return null;
  }

  // ── Mouse events ───────────────────────────────────────────────────────────
  onMouseDown(e: MouseEvent, vpIdx: number) {
    this.state.activeVp = vpIdx;
    const vp = this.state.vp[vpIdx];
    if (!vp.loadedImage) return;
    e.preventDefault();

    const img    = this.s2i(e, vpIdx);
    const sc     = this.screenXY(e, vpIdx);
    const canvas = this.cv(vpIdx)!;
    const tool   = this.state.activeTool;

    // ── Pan ────────────────────────────────────────────────────────────────
    if (tool === 'pan') {
      this.state.ix = {
        vpIdx, mode: 'pan', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: null
      };
      return;
    }

    // ── Erase ROI ─────────────────────────────────────────────────────────
    if (tool === 'erase-roi') {
      const hit = this.hitROI(vp, img.x, img.y);
      if (hit) {
        this.state.snap(vpIdx);
        vp.rois = vp.rois.filter(r => r.id !== hit.id);
        if (vp.selectedROIId === hit.id) { vp.selectedROIId = null; this.state.selectedROI = null; }
        this.draw(vpIdx);
      }
      return;
    }

    // ── Erase Ruler / Arrow ────────────────────────────────────────────────
    if (tool === 'erase-ruler') {
      const hit = this.hitRuler(vp, canvas, sc.x, sc.y);
      if (hit) {
        this.state.snap(vpIdx);
        vp.rulers = vp.rulers.filter((_, i) => i !== hit.i);
        this.draw(vpIdx);
      }
      return;
    }

    // ── Ruler ─────────────────────────────────────────────────────────────
    if (tool === 'ruler') {
      const hit = this.hitRuler(vp, canvas, sc.x, sc.y);
      if (hit) {
        this.state.snap(vpIdx);
        vp.rulers.forEach(r => r.isSelected = r.id === vp.rulers[hit.i].id);
        this.state.ix = {
          vpIdx,
          mode: hit.ep === 'start' ? 'move-ruler-start'
              : hit.ep === 'end'   ? 'move-ruler-end' : 'move-ruler-full',
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

    // ── Arrow ─────────────────────────────────────────────────────────────
    if (tool === 'arrow') {
      const hit = this.hitRuler(vp, canvas, sc.x, sc.y);
      if (hit && vp.rulers[hit.i].isArrow) {
        this.state.snap(vpIdx);
        vp.rulers.forEach(r => r.isSelected = r.id === vp.rulers[hit.i].id);
        this.state.ix = {
          vpIdx,
          mode: hit.ep === 'start' ? 'move-arrow-start'
              : hit.ep === 'end'   ? 'move-arrow-end' : 'move-arrow-full',
          imgX0: img.x, imgY0: img.y, clientX0: e.clientX, clientY0: e.clientY,
          panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0, rulerIdx: hit.i,
          rx1: vp.rulers[hit.i].x1, ry1: vp.rulers[hit.i].y1,
          rx2: vp.rulers[hit.i].x2, ry2: vp.rulers[hit.i].y2,
          tempROI: null, tempRuler: null
        };
        this.draw(vpIdx); return;
      }
      const tempA: RulerLine = { id: -1, x1: img.x, y1: img.y, x2: img.x, y2: img.y,
                                  isSelected: false, isArrow: true };
      vp.rulers.forEach(r => r.isSelected = false);
      this.state.ix = {
        vpIdx, mode: 'draw-arrow', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: tempA
      };
      return;
    }

    // ── Brush ─────────────────────────────────────────────────────────────
    if (tool === 'brush') {
      this.tempBrush = { points: [img], color: '#ff6e84' };
      this.state.ix = {
        vpIdx, mode: 'draw-brush', imgX0: img.x, imgY0: img.y,
        clientX0: e.clientX, clientY0: e.clientY,
        panX0: vp.panX, panY0: vp.panY, roiX0: 0, roiY0: 0,
        rulerIdx: -1, rx1: 0, ry1: 0, rx2: 0, ry2: 0, tempROI: null, tempRuler: null
      };
      return;
    }

    // ── ROI ───────────────────────────────────────────────────────────────
    if (tool === 'roi') {
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
    const vp  = this.state.vp[vpIdx];
    const img = this.s2i(e, vpIdx);

    if (ix.mode === 'pan') {
      vp.panX = ix.panX0 + (e.clientX - ix.clientX0);
      vp.panY = ix.panY0 + (e.clientY - ix.clientY0);
      this.draw(vpIdx); return;
    }
    if (ix.mode === 'draw-roi' && ix.tempROI) {
      const dx = Math.abs(img.x - ix.imgX0) / 2, dy = Math.abs(img.y - ix.imgY0) / 2;
      ix.tempROI.x  = (img.x + ix.imgX0) / 2; ix.tempROI.y  = (img.y + ix.imgY0) / 2;
      ix.tempROI.rx = dx || 1; ix.tempROI.ry = dy || 1;
      this.draw(vpIdx); return;
    }
    if ((ix.mode === 'draw-ruler' || ix.mode === 'draw-arrow') && ix.tempRuler) {
      ix.tempRuler.x2 = img.x; ix.tempRuler.y2 = img.y;
      this.draw(vpIdx); return;
    }
    if (ix.mode === 'draw-brush' && this.tempBrush) {
      this.tempBrush.points.push(img);
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
    if (ix.mode === 'move-ruler-full' || ix.mode === 'move-arrow-full') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) {
        const dx = img.x - ix.imgX0, dy = img.y - ix.imgY0;
        ru.x1 = ix.rx1 + dx; ru.y1 = ix.ry1 + dy; ru.x2 = ix.rx2 + dx; ru.y2 = ix.ry2 + dy;
        this.draw(vpIdx);
      } return;
    }
    if (ix.mode === 'move-ruler-start' || ix.mode === 'move-arrow-start') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) { ru.x1 = img.x; ru.y1 = img.y; this.draw(vpIdx); } return;
    }
    if (ix.mode === 'move-ruler-end' || ix.mode === 'move-arrow-end') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) { ru.x2 = img.x; ru.y2 = img.y; this.draw(vpIdx); }
    }
  }

  onMouseUp(e: MouseEvent, vpIdx: number) {
    const ix = this.state.ix;
    if (!ix || ix.vpIdx !== vpIdx) return;
    const vp  = this.state.vp[vpIdx];
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
    if ((ix.mode === 'draw-ruler' || ix.mode === 'draw-arrow') && ix.tempRuler) {
      const dist = Math.sqrt((img.x - ix.imgX0) ** 2 + (img.y - ix.imgY0) ** 2);
      if (dist > 5) {
        this.state.snap(vpIdx);
        vp.rulers.push({
          id: vp.rulerCounter++, x1: ix.imgX0, y1: ix.imgY0, x2: img.x, y2: img.y,
          isSelected: false, isArrow: ix.mode === 'draw-arrow'
        });
      }
    }
    if (ix.mode === 'draw-brush' && this.tempBrush) {
      if (this.tempBrush.points.length > 1) {
        this.state.snap(vpIdx);
        vp.brushStrokes.push({
          id: vp.brushCounter++,
          points: this.tempBrush.points,
          color:  this.tempBrush.color
        });
      }
      this.tempBrush = null;
    }

    this.state.ix = null;
    this.draw(vpIdx);
  }

  onMouseEnter(vpIdx: number) { this.state.activeVp = vpIdx; }

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  @HostListener('window:wheel', ['$event'])
  onWheel(e: WheelEvent) {
    for (let i = 0; i < this.state.vpCount; i++) {
      const c = this.cv(i);
      if (c && e.target === c) {
        if (!this.state.vp[i].loadedImage) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        this.state.vp[i].zoom = Math.min(Math.max(this.state.vp[i].zoom * delta, 0.03), 12);
        this.draw(i);
        return;
      }
    }
  }

  // ── Multi-frame navigation ─────────────────────────────────────────────────
  get frameCount():   number { return this.study.currentFrameCount(); }
  get currentFrame(): number { return this.study.currentFrame(); }

  private _navigateFrame(idx: number) {
    const vpIdx = this.state.activeVp;
    this.study.navigateFrame(idx, vpIdx, this.state.vp[vpIdx], (i) => this.draw(i));
  }
  prevFrame() { this._navigateFrame(this.currentFrame - 1); }
  nextFrame() { this._navigateFrame(this.currentFrame + 1); }

  // ── Cursor ────────────────────────────────────────────────────────────────
  get cursorClass(): string {
    const { activeTool, ix } = this.state;
    if (activeTool === 'pan')       return ix?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab';
    if (activeTool === 'roi') {
      if (ix?.mode === 'move-roi') return 'cursor-move';
      return ix?.mode === 'draw-roi' ? 'cursor-crosshair' : 'cursor-cell';
    }
    if (activeTool === 'ruler')     return 'cursor-crosshair';
    if (activeTool === 'arrow')     return 'cursor-crosshair';
    if (activeTool === 'brush')     return 'cursor-crosshair';
    if (activeTool === 'erase-roi' || activeTool === 'erase-ruler') return 'cursor-pointer';
    return 'cursor-default';
  }
}
