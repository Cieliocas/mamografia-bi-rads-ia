import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Trash2, Copy, Clipboard, Undo2, Redo2,
  Circle, Square, Columns, RotateCw, Download, FileText, FileJson
} from 'lucide-angular';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService } from '../../core/services/study.service';
import { ApiService } from '../../core/services/api.service';
import { biradsColor } from '../../shared/models/types';
import type { BiRads } from '../../shared/models/types';

@Component({
  selector: 'app-findings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './findings-panel.component.html',
})
export class FindingsPanelComponent {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);

  readonly icons = { Trash2, Copy, Clipboard, Undo2, Redo2, Circle, Square, Columns, RotateCw, Download, FileText, FileJson };

  // ── Export modal ───────────────────────────────────────────────────────────
  showExportModal = false;
  exportStudyIds: string[] = [];

  openExportModal() {
    const sid = this.study.currentStudyId();
    this.exportStudyIds = sid ? [sid] : [];
    this.showExportModal = true;
  }
  exportJSON()   { this.api.downloadExport('json', this.exportStudyIds); this.showExportModal = false; }
  exportCSV()    { this.api.downloadExport('csv',  this.exportStudyIds); this.showExportModal = false; }
  exportReport() {
    const sid = this.study.currentStudyId();
    if (sid) this.api.openReport(sid);
    this.showExportModal = false;
  }
  exportBackup() { this.api.downloadBackup(); this.showExportModal = false; }

  // ── Backend integration ─────────────────────────────────────────────────────
  runInference() { this.study.runInference(); }
  persist()      { this.study.saveAnnotations(this.state.rois); }

  /** Emitted when the consumer should redraw a viewport. */
  @Output() drawRequest = new EventEmitter<number>();

  /** Emitted when the consumer should toggle split mode. */
  @Output() toggleSplit = new EventEmitter<void>();

  /** Emitted when the consumer should ask-delete selected ROI. */
  @Output() askDelete = new EventEmitter<void>();

  /** Emitted when the consumer should ask-reset all annotations. */
  @Output() askReset = new EventEmitter<void>();

  draw(vpIdx = this.state.activeVp) { this.drawRequest.emit(vpIdx); }

  // ── BI-RADS color helper (used in template) ────────────────────────────────
  biradsColor(b: BiRads | string | null): string { return biradsColor(b); }

  // ── Actions ───────────────────────────────────────────────────────────────
  setBirads(b: BiRads) { this.state.setBirads(b, (i) => this.draw(i)); }

  updateROI() { this.state.updateROI((i) => this.draw(i)); }

  selectROI(vpIdx: number, id: number) {
    this.state.selectROI(vpIdx, id, (i) => this.draw(i));
  }

  undo() { this.state.undo(this.state.activeVp, (i) => this.draw(i)); }
  redo() { this.state.redo(this.state.activeVp, (i) => this.draw(i)); }

  copyROI()  { this.state.copyROI(); }
  pasteROI() { this.state.pasteROI((i) => this.draw(i)); }

  onContrastChange()   { this.draw(); }
  onBrightnessChange() { this.draw(); }

  resetWindowing() {
    const vp = this.state.activeVPData;
    vp.contrast = 80; vp.brightness = 100;
    this.draw();
  }

  rulerLength(x1: number, y1: number, x2: number, y2: number): string {
    return Math.round(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)).toString();
  }
}
