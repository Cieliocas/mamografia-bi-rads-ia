import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Activity, BarChart2, Clock, ImageIcon,
  Users, Database, RefreshCw, Ruler, Paintbrush, ArrowUpRight
} from 'lucide-angular';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService }       from '../../core/services/study.service';
import { ApiService, StudyListItem } from '../../core/services/api.service';
import { ROI, RulerLine, biradsColor } from '../../shared/models/types';
import { BIRADS_INFO } from '../../shared/models/types';

interface BiRadsSlice { label: string; count: number; color: string; pct: number; }
interface VpStat { idx: number; roiCount: number; rulerCount: number; arrowCount: number; brushCount: number; }

@Component({
  selector: 'app-analysis-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './analysis-panel.component.html',
})
export class AnalysisPanelComponent implements OnInit {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);

  readonly icons = {
    Activity, BarChart2, Clock, ImageIcon,
    Users, Database, RefreshCw, Ruler, Paintbrush, ArrowUpRight
  };

  readonly biradsInfo = BIRADS_INFO;

  // ── DB stats (loaded once) ─────────────────────────────────────────────────
  totalStudies  = 0;
  totalPatients = 0;
  loadingStats  = false;

  ngOnInit() { this.refresh(); }

  refresh() {
    this.loadingStats = true;
    // Use cached backend studies list; also fetch fresh patient count.
    this.study.refreshBackendStudies();
    this.api.listPatients('', 200).subscribe(list => {
      this.totalPatients = list.length;
      this.loadingStats  = false;
    });
  }

  get studyList(): StudyListItem[] { return this.study.backendStudies(); }
  get studyCount(): number { return this.studyList.length; }

  // ── Active VP ROIs ─────────────────────────────────────────────────────────
  get activeRois(): ROI[]        { return this.state.activeVPData.rois; }
  get activeRulers(): RulerLine[] { return this.state.activeVPData.rulers; }
  get rulerCount(): number  { return this.activeRulers.filter(r => !r.isArrow).length; }
  get arrowCount(): number  { return this.activeRulers.filter(r =>  r.isArrow).length; }
  get brushCount(): number  { return this.state.activeVPData.brushStrokes.length; }

  /** Average lesion radius (mean of rx+ry/2) across all ROIs with birads set. */
  get avgLesionPx(): string {
    const rois = this.activeRois.filter(r => r.rx > 0);
    if (!rois.length) return '—';
    const avg = rois.reduce((s, r) => s + (r.rx + r.ry) / 2, 0) / rois.length;
    return avg.toFixed(1) + ' px';
  }

  /** Largest lesion (by radius) label + size. */
  get largestLesion(): string {
    const rois = this.activeRois.filter(r => r.rx > 0);
    if (!rois.length) return '—';
    const max = rois.reduce((a, b) => (a.rx + a.ry) > (b.rx + b.ry) ? a : b);
    const label = max.label || (max.birads ? `BI-RADS ${max.birads}` : `ROI #${max.id}`);
    return `${label}: ${((max.rx + max.ry) / 2).toFixed(0)} px`;
  }

  // ── BI-RADS distribution ───────────────────────────────────────────────────
  get biradsDistribution(): BiRadsSlice[] {
    const counts: Record<string, number> = {};
    this.activeRois.forEach(r => {
      const key = r.birads ?? 'S/C';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    const total = this.activeRois.length || 1;
    const order = ['1','2','3','4A','4B','4C','5','6','S/C'];
    return order
      .filter(k => counts[k])
      .map(k => ({
        label: k,
        count: counts[k],
        color: biradsColor(k === 'S/C' ? null : k as any),
        pct: Math.round(counts[k] / total * 100)
      }));
  }

  // ── Per-VP summary (all active viewports) ─────────────────────────────────
  get vpStats(): VpStat[] {
    const out: VpStat[] = [];
    for (let i = 0; i < this.state.vpCount; i++) {
      const vp = this.state.vp[i];
      if (!vp.loadedImage) continue;
      out.push({
        idx:         i,
        roiCount:    vp.rois.length,
        rulerCount:  vp.rulers.filter(r => !r.isArrow).length,
        arrowCount:  vp.rulers.filter(r =>  r.isArrow).length,
        brushCount:  vp.brushStrokes.length,
      });
    }
    return out;
  }

  // ── Current patient info ───────────────────────────────────────────────────
  get patientName(): string {
    const p = this.study.currentPatient();
    if (!p) return '—';
    return p.name || `ext: ${p.external_id || p.id.slice(0, 8)}`;
  }

  get studyMeta()    { return this.study.currentMetadata(); }
  get clinicalData() { return this.study.currentClinical(); }

  /** Lesion size in mm using pixel spacing (when available). */
  get avgLesionMm(): string {
    const rois = this.activeRois.filter(r => r.rx > 0);
    const ps   = this.studyMeta?.pixelSpacing;
    if (!rois.length || !ps) return '';
    const avgPx = rois.reduce((s, r) => s + (r.rx + r.ry) / 2, 0) / rois.length;
    return `(${(avgPx * ps).toFixed(2)} mm)`;
  }
}
