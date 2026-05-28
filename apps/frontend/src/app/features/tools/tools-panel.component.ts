import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Hand, Target, Ruler, ArrowUpRight, Paintbrush,
  Eraser, Trash2, FlipHorizontal2,
  LayoutTemplate, Columns2, Grid2x2, LayoutGrid,
  RotateCcw, Sun, Contrast
} from 'lucide-angular';

import { ViewerStateService, GridLayout } from '../../core/services/viewer-state.service';
import { StudyService } from '../../core/services/study.service';
import { MAMMOGRAPHY_PRESETS, WindowPreset } from '../../shared/models/types';

@Component({
  selector: 'app-tools-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './tools-panel.component.html',
})
export class ToolsPanelComponent {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);

  readonly icons = {
    Hand, Target, Ruler, ArrowUpRight, Paintbrush,
    Eraser, Trash2, FlipHorizontal2,
    LayoutTemplate, Columns2, Grid2x2, LayoutGrid,
    RotateCcw, Sun, Contrast
  };

  /** Emitted when an action needs the viewer to redraw. */
  @Output() drawRequest = new EventEmitter<number>();

  draw(vpIdx = this.state.activeVp) { this.drawRequest.emit(vpIdx); }
  drawAll() { for (let i = 0; i < this.state.vpCount; i++) this.drawRequest.emit(i); }

  // ── Tool helpers ──────────────────────────────────────────────────────────
  isTool(t: string): boolean { return this.state.activeTool === t; }

  // ── Shape toggle ──────────────────────────────────────────────────────────
  get shapeLabel(): string { return this.state.activeShape === 'ellipse' ? 'Elipse' : 'Retângulo'; }
  toggleShape() {
    this.state.activeShape = this.state.activeShape === 'ellipse' ? 'rect' : 'ellipse';
  }

  // ── Invert ────────────────────────────────────────────────────────────────
  get invertActive(): boolean { return this.state.vp[this.state.activeVp].invertColors; }
  toggleInvert() { this.state.toggleInvert((i) => this.draw(i)); }

  // ── Brightness / contrast ─────────────────────────────────────────────────
  get brightness(): number { return this.state.activeVPData.brightness; }
  set brightness(v: number) {
    this.state.activeVPData.brightness = v;
    this.state.activeVPData.activePreset = null; // manual override
    this.draw();
  }

  get contrast(): number { return this.state.activeVPData.contrast; }
  set contrast(v: number) {
    this.state.activeVPData.contrast = v;
    this.state.activeVPData.activePreset = null; // manual override
    this.draw();
  }

  resetVisualization() {
    const vp = this.state.activeVPData;
    vp.brightness = 100; vp.contrast = 80; vp.invertColors = false;
    vp.activePreset = 'Padrão';
    this.draw();
  }

  /** Restaura o WW/WC do cabeçalho DICOM (J1). Disponível quando há metadados com WW/WC. */
  get hasDicomWindow(): boolean {
    const m = this.study.currentMetadata();
    return !!(m?.windowWidth && m.windowWidth > 0 && m?.windowCenter && m.windowCenter > 0);
  }

  restoreDicomWindow() {
    const m = this.study.currentMetadata();
    if (!m?.windowWidth || !m?.windowCenter) return;
    const f = wwwcToFilterTools(m.windowWidth, m.windowCenter);
    const vp = this.state.activeVPData;
    vp.brightness   = f.brightness;
    vp.contrast     = f.contrast;
    vp.invertColors = false;
    vp.activePreset = 'DICOM';
    this.draw();
  }

  // ── Windowing presets ─────────────────────────────────────────────────────
  readonly presets: WindowPreset[] = MAMMOGRAPHY_PRESETS;

  applyPreset(p: WindowPreset) {
    const vp = this.state.activeVPData;
    vp.brightness   = p.brightness;
    vp.contrast     = p.contrast;
    vp.activePreset = p.label;
    this.draw();
  }

  isActivePreset(label: string): boolean {
    return this.state.activeVPData.activePreset === label;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  setGrid(g: GridLayout) { this.state.setGrid(g, (i) => this.drawRequest.emit(i)); }
  isGrid(g: GridLayout): boolean { return this.state.gridLayout === g; }

  // ── Erase helpers ─────────────────────────────────────────────────────────
  clearBrush() {
    this.state.snap(this.state.activeVp);
    this.state.activeVPData.brushStrokes = [];
    this.draw();
  }

  clearRulers() {
    this.state.snap(this.state.activeVp);
    this.state.activeVPData.rulers = this.state.activeVPData.rulers.filter(r => !r.isArrow);
    this.draw();
  }

  clearArrows() {
    this.state.snap(this.state.activeVp);
    this.state.activeVPData.rulers = this.state.activeVPData.rulers.filter(r => r.isArrow);
    this.draw();
  }
}

/** Espelho da função wwwcToFilter do viewer — converte WW/WC em percentuais CSS. */
function wwwcToFilterTools(ww: number, wc: number): { contrast: number; brightness: number } {
  const contrast   = Math.round(Math.min(400, Math.max(20, (4096 / ww) * 80)));
  const brightness = Math.round(Math.min(200, Math.max(20, (wc / 2048) * 100)));
  return { contrast, brightness };
}
