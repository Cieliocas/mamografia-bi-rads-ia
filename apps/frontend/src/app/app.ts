import {
  Component, ElementRef, OnInit, OnDestroy, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, FolderOpen, History, BarChart3, Wrench,
  HelpCircle, Plus, ZoomIn, ZoomOut, Hand, Ruler, Maximize2,
  ChevronRight, ChevronLeft, AlertTriangle, Settings, User,
  RotateCw, Activity, Upload, X, Trash2, Pencil, Target,
  Circle, Square, Edit3, Columns, Copy, Undo, Redo
} from 'lucide-angular';
import {
  BiRads, ROI, RulerLine, Snapshot, VP, IxMode, Ix,
  mkVP, clone, d2, biradsColor, rgba, BIRADS_INFO, BIRADS_CHIPS
} from './shared/models/types';

@Component({
  selector: 'app-root', standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './app.html', styleUrls: ['./app.css']
})
export class App implements OnInit, OnDestroy {

  // Splash
  showSplash = true; progress = 0;
  private splashTick: ReturnType<typeof setInterval>|null = null;
  private splashFailSafe: ReturnType<typeof setTimeout>|null = null;

  // Viewports
  vp: VP[] = [mkVP(), mkVP()];
  activeVp = 0; splitMode = false; pendingVp = 0;

  // Tools
  activeTool: 'pan'|'roi'|'ruler' = 'pan';
  activeShape: 'ellipse'|'rect' = 'ellipse';
  private ix: Ix|null = null;

  // Editor
  selectedROI: ROI|null = null;
  clipboard: ROI|null = null;

  // Panels
  activePanel: 'images'|'history'|'analysis'|'tools' = 'images';
  leftOpen = true; rightOpen = true;

  // Modals
  showResetModal = false; pendingResetAll = false; pendingDeleteROI: ROI|null = null;

  // History
  historyFiles: {name:string; dataUrl:string; date:string}[] = [];

  readonly biradsChips: BiRads[] = BIRADS_CHIPS;
  readonly biradsInfo = BIRADS_INFO;

  readonly icons = {
    FolderOpen, History, BarChart3, Wrench, HelpCircle, Plus,
    ZoomIn, ZoomOut, Hand, Ruler, Maximize2, ChevronRight, ChevronLeft,
    AlertTriangle, Settings, User, RotateCw, Activity, Upload, X,
    Trash2, Pencil, Target, Circle, Square, Edit3, Columns, Copy, Undo, Redo
  };

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('c0',{static:false}) c0?: ElementRef<HTMLCanvasElement>;
  @ViewChild('c1',{static:false}) c1?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ct0',{static:false}) ct0?: ElementRef<HTMLDivElement>;
  @ViewChild('ct1',{static:false}) ct1?: ElementRef<HTMLDivElement>;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit() {
    this.splashTick = setInterval(() => {
      this.progress += 2;
      if (this.progress >= 100) {
        this.progress = 100;
        this.finishSplash(450);
      }
    }, 30);

    // Failsafe to avoid splash staying forever if something goes wrong.
    this.splashFailSafe = setTimeout(() => this.finishSplash(0), 8000);
  }
  ngOnDestroy() {
    if (this.splashTick) clearInterval(this.splashTick);
    if (this.splashFailSafe) clearTimeout(this.splashFailSafe);
  }

  private finishSplash(delay = 0) {
    if (this.splashTick) { clearInterval(this.splashTick); this.splashTick = null; }
    if (this.splashFailSafe) { clearTimeout(this.splashFailSafe); this.splashFailSafe = null; }
    setTimeout(() => { this.showSplash = false; }, delay);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private cv(i: number) { return i===0 ? this.c0?.nativeElement : this.c1?.nativeElement; }
  private ct(i: number) { return i===0 ? this.ct0?.nativeElement : this.ct1?.nativeElement; }

  biradsColor(b: BiRads|string|null): string { return biradsColor(b); }

  private i2s(vp: VP, ix: number, iy: number, cw: number, ch: number) {
    const cx = cw/2+vp.panX, cy = ch/2+vp.panY, img = vp.loadedImage!;
    return { x: cx+(ix-img.naturalWidth/2)*vp.zoom, y: cy+(iy-img.naturalHeight/2)*vp.zoom };
  }

  private s2i(e: MouseEvent, vpIdx: number) {
    const canvas = this.cv(vpIdx)!;
    const vp = this.vp[vpIdx];
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX-r.left, sy = e.clientY-r.top;
    const cx = canvas.width/2+vp.panX, cy = canvas.height/2+vp.panY;
    const img = vp.loadedImage!;
    return { x:(sx-cx)/vp.zoom+img.naturalWidth/2, y:(sy-cy)/vp.zoom+img.naturalHeight/2 };
  }

  private screenXY(e: MouseEvent, vpIdx: number) {
    const r = this.cv(vpIdx)!.getBoundingClientRect();
    return { x: e.clientX-r.left, y: e.clientY-r.top };
  }

  // ─── File loading ─────────────────────────────────────────────────────────
  openFileDialog(vpIdx = this.activeVp) {
    this.pendingVp = vpIdx; this.fileInput.nativeElement.click();
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0], vpIdx = this.pendingVp, vp = this.vp[vpIdx];
    vp.imageName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      vp.imageDataUrl = result;
      const img = new Image();
      img.onload = () => {
        vp.loadedImage = img;
        this.resetVP(vpIdx); this.clearAll(vpIdx, false);
        setTimeout(() => this.draw(vpIdx), 50);
        this.historyFiles.unshift({name: file.name, dataUrl: result, date: new Date().toLocaleString('pt-BR')});
        if (this.historyFiles.length > 20) this.historyFiles.pop();
      };
      img.src = result;
    };
    reader.readAsDataURL(file); input.value = '';
  }

  loadHistory(item: {name:string; dataUrl:string}) {
    const vp = this.vp[this.activeVp];
    vp.imageName = item.name; vp.imageDataUrl = item.dataUrl;
    const img = new Image();
    img.onload = () => { vp.loadedImage = img; this.resetVP(this.activeVp); this.clearAll(this.activeVp, false); setTimeout(() => this.draw(this.activeVp), 50); };
    img.src = item.dataUrl; this.activePanel = 'images';
  }

  // ─── Viewport controls ────────────────────────────────────────────────────
  resetVP(vpIdx: number) {
    const vp = this.vp[vpIdx], ct = this.ct(vpIdx);
    vp.zoom = 1; vp.panX = 0; vp.panY = 0; vp.contrast = 80; vp.brightness = 100;
    if (vp.loadedImage && ct) {
      vp.zoom = Math.min(ct.clientWidth/vp.loadedImage.naturalWidth, ct.clientHeight/vp.loadedImage.naturalHeight) * 0.9;
    }
  }

  zoomIn(vpIdx = this.activeVp) { this.vp[vpIdx].zoom = Math.min(this.vp[vpIdx].zoom*1.1, 12); this.draw(vpIdx); }
  zoomOut(vpIdx = this.activeVp) { this.vp[vpIdx].zoom = Math.max(this.vp[vpIdx].zoom/1.1, 0.03); this.draw(vpIdx); }
  fitScreen(vpIdx = this.activeVp) { this.resetVP(vpIdx); this.draw(vpIdx); }

  setTool(t: 'pan'|'roi'|'ruler') { this.activeTool = t; this.ix = null; }
  setPanel(p: 'images'|'history'|'analysis'|'tools') { this.activePanel = p; }
  toggleLeftSidebar() { this.leftOpen = !this.leftOpen; }
  toggleRightPanel() { this.rightOpen = !this.rightOpen; }

  closeModal() {
    this.showResetModal = false;
    this.pendingResetAll = false;
    this.pendingDeleteROI = null;
  }

  onContrastChange(vpIdx = this.activeVp) { this.draw(vpIdx); }
  setActiveVp(i: number) {
    this.activeVp = i;
    const vp = this.vp[i];
    this.selectedROI = vp.selectedROIId !== null ? vp.rois.find(r => r.id === vp.selectedROIId) ?? null : null;
  }

  toggleSplit() {
    this.splitMode = !this.splitMode;
    if (!this.splitMode) this.activeVp = 0;
    setTimeout(() => { this.draw(0); if (this.splitMode) this.draw(1); }, 150);
  }

  // ─── Undo / Redo ──────────────────────────────────────────────────────────
  private snap(vpIdx: number) {
    const vp = this.vp[vpIdx];
    vp.undoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    if (vp.undoStack.length > 50) vp.undoStack.shift();
    vp.redoStack = [];
  }

  undo(vpIdx = this.activeVp) {
    const vp = this.vp[vpIdx];
    if (!vp.undoStack.length) return;
    vp.redoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    const s = vp.undoStack.pop()!;
    vp.rois = s.rois; vp.rulers = s.rulers;
    vp.selectedROIId = null; this.selectedROI = null; this.draw(vpIdx);
  }

  redo(vpIdx = this.activeVp) {
    const vp = this.vp[vpIdx];
    if (!vp.redoStack.length) return;
    vp.undoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    const s = vp.redoStack.pop()!;
    vp.rois = s.rois; vp.rulers = s.rulers;
    vp.selectedROIId = null; this.selectedROI = null; this.draw(vpIdx);
  }

  // ─── Clipboard ────────────────────────────────────────────────────────────
  copyROI() { if (this.selectedROI) this.clipboard = clone(this.selectedROI); }

  pasteROI() {
    if (!this.clipboard) return;
    const vp = this.vp[this.activeVp]; this.snap(this.activeVp);
    const n: ROI = { ...clone(this.clipboard), id: vp.roiCounter++, x: this.clipboard.x+20, y: this.clipboard.y+20, isSelected: true };
    vp.rois.forEach(r => r.isSelected = false);
    vp.rois.push(n); vp.selectedROIId = n.id; this.selectedROI = n;
    if (!this.rightOpen) this.rightOpen = true;
    this.draw(this.activeVp);
  }

  // ─── ROI management ───────────────────────────────────────────────────────
  selectROI(vpIdx: number, id: number) {
    const vp = this.vp[vpIdx];
    vp.rois.forEach(r => r.isSelected = r.id === id);
    vp.selectedROIId = id; this.activeVp = vpIdx;
    this.selectedROI = vp.rois.find(r => r.id === id) ?? null;
    if (!this.rightOpen) this.rightOpen = true;
    this.draw(vpIdx);
  }

  deselectROI() {
    const vp = this.vp[this.activeVp];
    vp.rois.forEach(r => r.isSelected = false);
    vp.selectedROIId = null; this.selectedROI = null; this.draw(this.activeVp);
  }

  updateROI() {
    if (!this.selectedROI) return;
    const vp = this.vp[this.activeVp];
    const i = vp.rois.findIndex(r => r.id === this.selectedROI!.id);
    if (i >= 0) vp.rois[i] = { ...this.selectedROI };
    this.draw(this.activeVp);
  }

  setBirads(b: BiRads) {
    if (!this.selectedROI) return;
    this.selectedROI.birads = b;
    if (!this.selectedROI.label) this.selectedROI.label = `BI-RADS ${b}`;
    this.updateROI();
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  askDelete(roi: ROI) { this.pendingDeleteROI = roi; this.pendingResetAll = false; this.showResetModal = true; }
  askReset() { this.pendingResetAll = true; this.pendingDeleteROI = null; this.showResetModal = true; }

  confirmModal() {
    if (this.pendingResetAll) {
      this.clearAll(this.activeVp, true);
    } else if (this.pendingDeleteROI) {
      this.snap(this.activeVp);
      const vp = this.vp[this.activeVp];
      vp.rois = vp.rois.filter(r => r.id !== this.pendingDeleteROI!.id);
      if (vp.selectedROIId === this.pendingDeleteROI.id) { vp.selectedROIId = null; this.selectedROI = null; }
      this.draw(this.activeVp);
    }
    this.showResetModal = false; this.pendingDeleteROI = null;
  }

  clearAll(vpIdx: number, saveUndo = true) {
    if (saveUndo) this.snap(vpIdx);
    const vp = this.vp[vpIdx];
    vp.rois = []; vp.rulers = []; vp.selectedROIId = null;
    if (vpIdx === this.activeVp) this.selectedROI = null;
    this.ix = null; this.draw(vpIdx);
  }

  // ─── Hit testing ──────────────────────────────────────────────────────────
  private hitROI(vp: VP, ix: number, iy: number): ROI|null {
    for (let i = vp.rois.length-1; i >= 0; i--) {
      const r = vp.rois[i];
      if (r.shape === 'ellipse') {
        const dx = (ix-r.x)/(r.rx||1), dy = (iy-r.y)/(r.ry||1);
        if (dx*dx+dy*dy <= 1.4) return r;
      } else {
        if (Math.abs(ix-r.x) <= r.rx*1.4 && Math.abs(iy-r.y) <= r.ry*1.4) return r;
      }
    }
    return null;
  }

  private hitRuler(vp: VP, canvas: HTMLCanvasElement, sx: number, sy: number) {
    const cw = canvas.width, ch = canvas.height;
    for (let i = vp.rulers.length-1; i >= 0; i--) {
      const ru = vp.rulers[i];
      const a = this.i2s(vp, ru.x1, ru.y1, cw, ch);
      const b = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      if (d2(sx,sy,a.x,a.y) <= 9) return { i, ep: 'start' as const };
      if (d2(sx,sy,b.x,b.y) <= 9) return { i, ep: 'end' as const };
      const l2 = (b.x-a.x)**2+(b.y-a.y)**2;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((sx-a.x)*(b.x-a.x)+(sy-a.y)*(b.y-a.y))/l2));
      if (d2(sx,sy, a.x+t*(b.x-a.x), a.y+t*(b.y-a.y)) <= 7) return { i, ep: 'full' as const };
    }
    return null;
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────
  draw(vpIdx: number) {
    const canvas = this.cv(vpIdx), ct = this.ct(vpIdx), vp = this.vp[vpIdx];
    if (!canvas || !ct) return;
    canvas.width = ct.clientWidth; canvas.height = ct.clientHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (vp.loadedImage) {
      ctx.save();
      ctx.filter = `contrast(${vp.contrast}%) brightness(${vp.brightness}%)`;
      const cx = canvas.width/2+vp.panX, cy = canvas.height/2+vp.panY;
      ctx.translate(cx, cy); ctx.scale(vp.zoom, vp.zoom);
      const img = vp.loadedImage;
      ctx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2, img.naturalWidth, img.naturalHeight);
      ctx.restore();
    }

    const tROI = this.ix?.vpIdx===vpIdx && this.ix.mode==='draw-roi' ? this.ix.tempROI : null;
    const tRuler = this.ix?.vpIdx===vpIdx && this.ix.mode==='draw-ruler' ? this.ix.tempRuler : null;
    this.drawROIs(ctx, canvas.width, canvas.height, vp, tROI);
    this.drawRulers(ctx, canvas.width, canvas.height, vp, tRuler);
  }

  private drawROIs(ctx: CanvasRenderingContext2D, cw: number, ch: number, vp: VP, temp: ROI|null) {
    const all = [...vp.rois, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(roi => {
      if (!vp.loadedImage) return;
      const c = this.i2s(vp, roi.x, roi.y, cw, ch);
      const srx = Math.max(2, roi.rx*vp.zoom), sry = Math.max(2, roi.ry*vp.zoom);
      const col = roi.isSelected ? '#afa2ff' : this.biradsColor(roi.birads);
      ctx.strokeStyle = col; ctx.lineWidth = roi.isSelected ? 2.5 : 1.8;
      ctx.fillStyle = rgba(col, roi.isSelected ? 0.18 : 0.11);
      ctx.beginPath();
      if (roi.shape === 'ellipse') ctx.ellipse(c.x, c.y, srx, sry, 0, 0, Math.PI*2);
      else ctx.rect(c.x-srx, c.y-sry, srx*2, sry*2);
      ctx.fill(); ctx.stroke();
      if (roi.isSelected) {
        ctx.save(); ctx.strokeStyle='#afa2ff'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
        ctx.beginPath();
        if (roi.shape==='ellipse') ctx.ellipse(c.x,c.y,srx+5,sry+5,0,0,Math.PI*2);
        else ctx.rect(c.x-srx-5,c.y-sry-5,(srx+5)*2,(sry+5)*2);
        ctx.stroke(); ctx.restore();
      }
      if (roi.id > 0) {
        ctx.fillStyle = col;
        ctx.font = `bold ${Math.max(9,Math.min(12,11*vp.zoom))}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(roi.label||(roi.birads?`BI-RADS ${roi.birads}`:`ROI #${roi.id}`), c.x, c.y-sry-5);
      }
    });
    ctx.restore();
  }

  private drawRulers(ctx: CanvasRenderingContext2D, cw: number, ch: number, vp: VP, temp: RulerLine|null) {
    const all = [...vp.rulers, ...(temp ? [temp] : [])];
    ctx.save();
    all.forEach(ru => {
      if (!vp.loadedImage) return;
      const a = this.i2s(vp, ru.x1, ru.y1, cw, ch), b = this.i2s(vp, ru.x2, ru.y2, cw, ch);
      const dist = Math.sqrt((ru.x2-ru.x1)**2+(ru.y2-ru.y1)**2).toFixed(1);
      const col = ru.isSelected ? '#afa2ff' : '#7b9fff';
      ctx.strokeStyle = col; ctx.lineWidth = ru.isSelected ? 2 : 1.5;
      ctx.setLineDash([5,4]);
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.setLineDash([]);
      [a,b].forEach(pt => { ctx.beginPath(); ctx.arc(pt.x,pt.y,ru.isSelected?5:3,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); });
      ctx.fillStyle = col;
      ctx.font = 'bold 11px Inter,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${dist}px`, (a.x+b.x)/2, (a.y+b.y)/2-9);
    });
    ctx.restore();
  }

  // ─── Mouse events ─────────────────────────────────────────────────────────
  onMouseDown(e: MouseEvent, vpIdx: number) {
    this.activeVp = vpIdx;
    const vp = this.vp[vpIdx];
    if (!vp.loadedImage) return;
    e.preventDefault();

    const img = this.s2i(e, vpIdx);
    const sc = this.screenXY(e, vpIdx);
    const canvas = this.cv(vpIdx)!;

    if (this.activeTool === 'pan') {
      this.ix = { vpIdx, mode:'pan', imgX0:img.x, imgY0:img.y, clientX0:e.clientX, clientY0:e.clientY,
        panX0:vp.panX, panY0:vp.panY, roiX0:0, roiY0:0, rulerIdx:-1, rx1:0,ry1:0,rx2:0,ry2:0,
        tempROI:null, tempRuler:null };
      return;
    }

    if (this.activeTool === 'ruler') {
      // Hit test existing rulers first
      const hit = this.hitRuler(vp, canvas, sc.x, sc.y);
      if (hit) {
        this.snap(vpIdx);
        vp.rulers.forEach(r => r.isSelected = r.id === vp.rulers[hit.i].id);
        this.ix = { vpIdx, mode: hit.ep==='start'?'move-ruler-start': hit.ep==='end'?'move-ruler-end':'move-ruler-full',
          imgX0:img.x, imgY0:img.y, clientX0:e.clientX, clientY0:e.clientY, panX0:vp.panX, panY0:vp.panY,
          roiX0:0, roiY0:0, rulerIdx:hit.i,
          rx1:vp.rulers[hit.i].x1, ry1:vp.rulers[hit.i].y1, rx2:vp.rulers[hit.i].x2, ry2:vp.rulers[hit.i].y2,
          tempROI:null, tempRuler:null };
        this.draw(vpIdx); return;
      }
      // Start drawing new ruler
      const tempR: RulerLine = { id:-1, x1:img.x, y1:img.y, x2:img.x, y2:img.y, isSelected:false };
      vp.rulers.forEach(r => r.isSelected = false);
      this.ix = { vpIdx, mode:'draw-ruler', imgX0:img.x, imgY0:img.y, clientX0:e.clientX, clientY0:e.clientY,
        panX0:vp.panX, panY0:vp.panY, roiX0:0, roiY0:0, rulerIdx:-1, rx1:0,ry1:0,rx2:0,ry2:0,
        tempROI:null, tempRuler:tempR };
      return;
    }

    if (this.activeTool === 'roi') {
      const hit = this.hitROI(vp, img.x, img.y);
      if (hit) {
        // If already selected → start moving
        if (hit.id === vp.selectedROIId) {
          this.snap(vpIdx);
          this.ix = { vpIdx, mode:'move-roi', imgX0:img.x, imgY0:img.y, clientX0:e.clientX, clientY0:e.clientY,
            panX0:vp.panX, panY0:vp.panY, roiX0:hit.x, roiY0:hit.y, rulerIdx:-1, rx1:0,ry1:0,rx2:0,ry2:0,
            tempROI:null, tempRuler:null };
          return;
        }
        // Select it
        this.selectROI(vpIdx, hit.id); return;
      }
      // Deselect + start drawing
      vp.rois.forEach(r => r.isSelected = false);
      vp.selectedROIId = null; this.selectedROI = null;
      const tROI: ROI = { id:-1, x:img.x, y:img.y, rx:0, ry:0, shape:this.activeShape, birads:null, label:'', notes:'', isSelected:false };
      this.ix = { vpIdx, mode:'draw-roi', imgX0:img.x, imgY0:img.y, clientX0:e.clientX, clientY0:e.clientY,
        panX0:vp.panX, panY0:vp.panY, roiX0:img.x, roiY0:img.y, rulerIdx:-1, rx1:0,ry1:0,rx2:0,ry2:0,
        tempROI:tROI, tempRuler:null };
    }
  }

  onMouseMove(e: MouseEvent, vpIdx: number) {
    if (!this.ix || this.ix.vpIdx !== vpIdx) return;
    const vp = this.vp[vpIdx];
    const img = this.s2i(e, vpIdx);
    const ix = this.ix;

    if (ix.mode === 'pan') {
      vp.panX = ix.panX0 + (e.clientX - ix.clientX0);
      vp.panY = ix.panY0 + (e.clientY - ix.clientY0);
      this.draw(vpIdx); return;
    }

    if (ix.mode === 'draw-roi' && ix.tempROI) {
      const dx = Math.abs(img.x-ix.imgX0)/2, dy = Math.abs(img.y-ix.imgY0)/2;
      ix.tempROI.x = (img.x+ix.imgX0)/2; ix.tempROI.y = (img.y+ix.imgY0)/2;
      ix.tempROI.rx = dx||1; ix.tempROI.ry = dy||1;
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
        if (this.selectedROI?.id === roi.id) this.selectedROI = { ...roi };
        this.draw(vpIdx);
      } return;
    }

    if (ix.mode === 'move-ruler-full') {
      const ru = vp.rulers[ix.rulerIdx];
      if (ru) {
        const dx = img.x-ix.imgX0, dy = img.y-ix.imgY0;
        ru.x1 = ix.rx1+dx; ru.y1 = ix.ry1+dy; ru.x2 = ix.rx2+dx; ru.y2 = ix.ry2+dy;
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
    if (!this.ix || this.ix.vpIdx !== vpIdx) return;
    const vp = this.vp[vpIdx];
    const img = this.s2i(e, vpIdx);
    const ix = this.ix;

    if (ix.mode === 'draw-roi' && ix.tempROI) {
      const dx = Math.abs(img.x-ix.imgX0)/2, dy = Math.abs(img.y-ix.imgY0)/2;
      if (dx > 4 || dy > 4) {
        this.snap(vpIdx);
        const n: ROI = {
          id: vp.roiCounter++, x:(img.x+ix.imgX0)/2, y:(img.y+ix.imgY0)/2,
          rx:Math.max(dx,6), ry:Math.max(dy,6), shape:this.activeShape,
          birads:null, label:'', notes:'', isSelected:true
        };
        vp.rois.forEach(r => r.isSelected = false);
        vp.rois.push(n); vp.selectedROIId = n.id; this.selectedROI = n;
        if (!this.rightOpen) this.rightOpen = true;
      }
    }

    if (ix.mode === 'draw-ruler' && ix.tempRuler) {
      if (Math.sqrt((img.x-ix.imgX0)**2+(img.y-ix.imgY0)**2) > 5) {
        this.snap(vpIdx);
        vp.rulers.push({ id:vp.rulerCounter++, x1:ix.imgX0, y1:ix.imgY0, x2:img.x, y2:img.y, isSelected:false });
      }
    }

    this.ix = null; this.draw(vpIdx);
  }

  onMouseEnter(vpIdx: number) { this.activeVp = vpIdx; }

  // Template aliases
  setActiveTool(t: 'pan'|'roi'|'ruler') { this.setTool(t); }
  fitToScreen(vpIdx = this.activeVp) { this.fitScreen(vpIdx); }
  requestResetAll() { this.askReset(); }
  requestDeleteROI(roi: ROI) { this.askDelete(roi); }
  loadFromHistory(item: {name:string; dataUrl:string; date:string}) { this.loadHistory(item); }
  drawCanvas(vpIdx = this.activeVp) { this.draw(vpIdx); }
  updateSelectedROI() { this.updateROI(); }
  padNum(n: number) { return this.pad(n); }

  // ─── Wheel zoom ───────────────────────────────────────────────────────────
  @HostListener('window:wheel', ['$event'])
  onWheel(e: WheelEvent) {
    const c0 = this.cv(0), c1 = this.cv(1);
    let vpIdx = -1;
    if (c0 && (e.target === c0)) vpIdx = 0;
    else if (c1 && (e.target === c1)) vpIdx = 1;
    if (vpIdx < 0) return;
    if (!this.vp[vpIdx].loadedImage) return;
    e.preventDefault();
    // 50% reduced sensitivity: ±5% per tick
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    const vp = this.vp[vpIdx];
    vp.zoom = Math.min(Math.max(vp.zoom * delta, 0.03), 12);
    this.draw(vpIdx);
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
    else if (ctrl && e.key === 'c') { e.preventDefault(); this.copyROI(); }
    else if (ctrl && e.key === 'v') { e.preventDefault(); this.pasteROI(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const active = document.activeElement as HTMLElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
      const vp = this.vp[this.activeVp];
      if (vp.selectedROIId !== null) { this.snap(this.activeVp); vp.rois = vp.rois.filter(r => r.id !== vp.selectedROIId); vp.selectedROIId = null; this.selectedROI = null; this.draw(this.activeVp); }
    }
    else if (e.key === 'Escape') this.deselectROI();
    else if (e.key === 'p' || e.key === 'P') this.setTool('pan');
    else if (e.key === 'r' || e.key === 'R') this.setTool('roi');
    else if (e.key === 'l' || e.key === 'L') this.setTool('ruler');
  }

  // ─── Computed getters ─────────────────────────────────────────────────────
  get cursorClass(): string {
    if (this.activeTool === 'pan') return this.ix?.mode === 'pan' ? 'cursor-grabbing' : 'cursor-grab';
    if (this.activeTool === 'roi') {
      if (this.ix?.mode === 'move-roi') return 'cursor-move';
      return this.ix?.mode === 'draw-roi' ? 'cursor-crosshair' : 'cursor-cell';
    }
    if (this.activeTool === 'ruler') return 'cursor-crosshair';
    return 'cursor-default';
  }

  get totalAnnotations(): number { return this.vp[this.activeVp].rois.length + this.vp[this.activeVp].rulers.length; }
  get activeVPData(): VP { return this.vp[this.activeVp]; }
  zoomPct(vpIdx: number): string { return Math.round(this.vp[vpIdx].zoom * 100) + '%'; }
  pad(n: number): string { return String(n).padStart(2,'0'); }
  get loadedImage() { return this.activeVPData.loadedImage; }
  get imageDataUrl() { return this.activeVPData.imageDataUrl; }
  set imageDataUrl(v: string|null) { this.activeVPData.imageDataUrl = v; }
  get imageName() { return this.activeVPData.imageName; }
  set imageName(v: string) { this.activeVPData.imageName = v; }
  get contrast() { return this.activeVPData.contrast; }
  set contrast(v: number) { this.activeVPData.contrast = v; }
  get brightness() { return this.activeVPData.brightness; }
  set brightness(v: number) { this.activeVPData.brightness = v; }
  get rois() { return this.activeVPData.rois; }
  get rulers() { return this.activeVPData.rulers; }
  get zoomPercent() { return this.zoomPct(this.activeVp); }
  get leftSidebarOpen() { return this.leftOpen; }
  get rightPanelOpen() { return this.rightOpen; }
  get activeROIShape() { return this.activeShape; }
  set activeROIShape(v: 'ellipse'|'rect') { this.activeShape = v; }
  readonly biradsLabels = this.biradsInfo;

  readonly biradsChipsAll: BiRads[] = ['1','2','3','4A','4B','4C','5','6'];
}
