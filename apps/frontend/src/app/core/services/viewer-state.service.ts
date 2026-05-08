import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import {
  BiRads, ROI, RulerLine, VP, Ix,
  mkVP, clone, BIRADS_CHIPS, BIRADS_INFO
} from '../../shared/models/types';

export type ActiveTool = 'pan'|'roi'|'ruler';
export type ActiveShape = 'ellipse'|'rect';
export type ActivePanel = 'home'|'files'|'history'|'patients'|'analysis'|'tools';

@Injectable({ providedIn: 'root' })
export class ViewerStateService {

  // ── Viewports ─────────────────────────────────────────────────────────────
  vp: VP[] = [mkVP(), mkVP()];
  activeVp = 0;
  splitMode = false;
  pendingVp = 0;

  // ── Tools ─────────────────────────────────────────────────────────────────
  activeTool: ActiveTool = 'pan';
  activeShape: ActiveShape = 'ellipse';
  ix: Ix|null = null;

  // ── Selection / Clipboard ─────────────────────────────────────────────────
  selectedROI: ROI|null = null;
  clipboard: ROI|null = null;

  // ── UI state ──────────────────────────────────────────────────────────────
  activePanel: ActivePanel = 'home';
  leftOpen = true;
  rightOpen = true;
  showResetModal = false;
  pendingResetAll = false;
  pendingDeleteROI: ROI|null = null;

  // ── Constants ─────────────────────────────────────────────────────────────
  readonly biradsChips = BIRADS_CHIPS;
  readonly biradsInfo  = BIRADS_INFO;

  // ── Getters ───────────────────────────────────────────────────────────────
  get activeVPData(): VP { return this.vp[this.activeVp]; }
  get rois(): ROI[] { return this.activeVPData.rois; }
  get rulers(): RulerLine[] { return this.activeVPData.rulers; }

  // ── Tool / panel controls ─────────────────────────────────────────────────
  setTool(t: ActiveTool) { this.activeTool = t; this.ix = null; }
  setPanel(p: ActivePanel) { this.activePanel = p; }
  toggleLeftSidebar() { this.leftOpen = !this.leftOpen; }
  toggleRightPanel() { this.rightOpen = !this.rightOpen; }

  setActiveVp(i: number) {
    this.activeVp = i;
    const vp = this.vp[i];
    this.selectedROI = vp.selectedROIId !== null
      ? vp.rois.find(r => r.id === vp.selectedROIId) ?? null
      : null;
  }

  toggleSplit(drawFn: (i: number) => void) {
    this.splitMode = !this.splitMode;
    if (!this.splitMode) this.activeVp = 0;
    setTimeout(() => { drawFn(0); if (this.splitMode) drawFn(1); }, 150);
  }

  // Emits the active vpIdx every time annotations change. Subscribers
  // (e.g. autosave) can debounce off this signal.
  readonly annotationsChanged$ = new Subject<number>();

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  snap(vpIdx: number) {
    const vp = this.vp[vpIdx];
    vp.undoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    if (vp.undoStack.length > 50) vp.undoStack.shift();
    vp.redoStack = [];
    this.annotationsChanged$.next(vpIdx);
  }

  undo(vpIdx: number, drawFn: (i: number) => void) {
    const vp = this.vp[vpIdx];
    if (!vp.undoStack.length) return;
    vp.redoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    const s = vp.undoStack.pop()!;
    vp.rois = s.rois; vp.rulers = s.rulers;
    this.annotationsChanged$.next(vpIdx);
    vp.selectedROIId = null; this.selectedROI = null;
    drawFn(vpIdx);
  }

  redo(vpIdx: number, drawFn: (i: number) => void) {
    const vp = this.vp[vpIdx];
    if (!vp.redoStack.length) return;
    vp.undoStack.push({ rois: clone(vp.rois), rulers: clone(vp.rulers) });
    const s = vp.redoStack.pop()!;
    vp.rois = s.rois; vp.rulers = s.rulers;
    this.annotationsChanged$.next(vpIdx);
    vp.selectedROIId = null; this.selectedROI = null;
    drawFn(vpIdx);
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────
  copyROI() { if (this.selectedROI) this.clipboard = clone(this.selectedROI); }

  pasteROI(drawFn: (i: number) => void) {
    if (!this.clipboard) return;
    const vp = this.vp[this.activeVp];
    this.snap(this.activeVp);
    const n: ROI = {
      ...clone(this.clipboard),
      id: vp.roiCounter++,
      x: this.clipboard.x + 20,
      y: this.clipboard.y + 20,
      isSelected: true
    };
    vp.rois.forEach(r => r.isSelected = false);
    vp.rois.push(n); vp.selectedROIId = n.id; this.selectedROI = n;
    if (!this.rightOpen) this.rightOpen = true;
    drawFn(this.activeVp);
  }

  // ── ROI management ────────────────────────────────────────────────────────
  selectROI(vpIdx: number, id: number, drawFn: (i: number) => void) {
    const vp = this.vp[vpIdx];
    vp.rois.forEach(r => r.isSelected = r.id === id);
    vp.selectedROIId = id; this.activeVp = vpIdx;
    this.selectedROI = vp.rois.find(r => r.id === id) ?? null;
    if (!this.rightOpen) this.rightOpen = true;
    drawFn(vpIdx);
  }

  deselectROI(drawFn: (i: number) => void) {
    const vp = this.vp[this.activeVp];
    vp.rois.forEach(r => r.isSelected = false);
    vp.selectedROIId = null; this.selectedROI = null;
    drawFn(this.activeVp);
  }

  updateROI(drawFn: (i: number) => void) {
    if (!this.selectedROI) return;
    const vp = this.vp[this.activeVp];
    const i = vp.rois.findIndex(r => r.id === this.selectedROI!.id);
    if (i >= 0) vp.rois[i] = { ...this.selectedROI };
    drawFn(this.activeVp);
  }

  setBirads(b: BiRads, drawFn: (i: number) => void) {
    if (!this.selectedROI) return;
    this.selectedROI.birads = b;
    if (!this.selectedROI.label) this.selectedROI.label = `BI-RADS ${b}`;
    this.updateROI(drawFn);
  }

  clearAll(vpIdx: number, saveUndo: boolean, drawFn: (i: number) => void) {
    if (saveUndo) this.snap(vpIdx);
    const vp = this.vp[vpIdx];
    vp.rois = []; vp.rulers = []; vp.selectedROIId = null;
    if (vpIdx === this.activeVp) this.selectedROI = null;
    this.ix = null;
    drawFn(vpIdx);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  askDelete(roi: ROI) {
    this.pendingDeleteROI = roi;
    this.pendingResetAll = false;
    this.showResetModal = true;
  }

  askReset() {
    this.pendingResetAll = true;
    this.pendingDeleteROI = null;
    this.showResetModal = true;
  }

  closeModal() {
    this.showResetModal = false;
    this.pendingResetAll = false;
    this.pendingDeleteROI = null;
  }

  confirmModal(drawFn: (i: number) => void) {
    if (this.pendingResetAll) {
      this.clearAll(this.activeVp, true, drawFn);
    } else if (this.pendingDeleteROI) {
      this.snap(this.activeVp);
      const vp = this.vp[this.activeVp];
      vp.rois = vp.rois.filter(r => r.id !== this.pendingDeleteROI!.id);
      if (vp.selectedROIId === this.pendingDeleteROI.id) {
        vp.selectedROIId = null; this.selectedROI = null;
      }
      drawFn(this.activeVp);
    }
    this.showResetModal = false;
    this.pendingDeleteROI = null;
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────
  zoomIn(vpIdx: number, drawFn: (i: number) => void) {
    this.vp[vpIdx].zoom = Math.min(this.vp[vpIdx].zoom * 1.1, 12);
    drawFn(vpIdx);
  }

  zoomOut(vpIdx: number, drawFn: (i: number) => void) {
    this.vp[vpIdx].zoom = Math.max(this.vp[vpIdx].zoom / 1.1, 0.03);
    drawFn(vpIdx);
  }

  zoomPct(vpIdx: number): string {
    return Math.round(this.vp[vpIdx].zoom * 100) + '%';
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
}
