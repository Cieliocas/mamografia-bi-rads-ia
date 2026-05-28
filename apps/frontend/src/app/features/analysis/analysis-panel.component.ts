import { Component, OnInit, OnDestroy, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Activity, BarChart2, Clock, ImageIcon,
  Users, Database, RefreshCw, Ruler, Paintbrush, ArrowUpRight, GitCompare
} from 'lucide-angular';
import { Subscription } from 'rxjs';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService }       from '../../core/services/study.service';
import { ApiService, StudyListItem, PatientStudyDTO } from '../../core/services/api.service';
import { ROI, RulerLine, biradsColor } from '../../shared/models/types';
import { BIRADS_INFO } from '../../shared/models/types';

interface BiRadsSlice { label: string; count: number; color: string; pct: number; }
interface VpStat { idx: number; roiCount: number; rulerCount: number; arrowCount: number; brushCount: number; }

/** One data point on the BI-RADS timeline chart. */
export interface TimelinePoint {
  study:  PatientStudyDTO;
  /** X position 0-1 (normalised within the date range). */
  xRel: number;
  /** BI-RADS level 1-6 (0 = unknown). */
  biRadsNum: number;
  /** Hex fill colour for the dot. */
  color: string;
  /** ISO date string for the tooltip label. */
  dateLabel: string;
}

@Component({
  selector: 'app-analysis-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './analysis-panel.component.html',
})
export class AnalysisPanelComponent implements OnInit, OnDestroy {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);

  readonly icons = {
    Activity, BarChart2, Clock, ImageIcon,
    Users, Database, RefreshCw, Ruler, Paintbrush, ArrowUpRight, GitCompare
  };

  /** Emitted when the user clicks a history point to compare in VP1. */
  @Output() compareWith = new EventEmitter<string>();

  // ── Temporal history ────────────────────────────────────────────────────────
  historyStudies: PatientStudyDTO[] = [];
  historyLoading = false;
  historyError   = false;
  private _histSub?: Subscription;
  private _loadedPatientId = '';

  readonly biradsInfo = BIRADS_INFO;

  // ── DB stats (loaded once) ─────────────────────────────────────────────────
  totalStudies  = 0;
  totalPatients = 0;
  loadingStats  = false;

  ngOnInit() {
    this.refresh();
    this.loadPatientHistory();
  }

  ngOnDestroy() {
    this._histSub?.unsubscribe();
  }

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

  // ── Temporal comparison ────────────────────────────────────────────────────

  /** Load (or reload) the patient's study history from the backend. */
  loadPatientHistory() {
    const patient = this.study.currentPatient();
    if (!patient) { this.historyStudies = []; return; }
    if (patient.id === this._loadedPatientId && this.historyStudies.length) return;

    this._loadedPatientId = patient.id;
    this.historyLoading = true;
    this.historyError   = false;
    this._histSub?.unsubscribe();
    this._histSub = this.api.listPatientStudies(patient.id).subscribe({
      next: (list) => {
        // Sort oldest → newest for the timeline.
        this.historyStudies = [...list].sort((a, b) => {
          const da = new Date(a.study_date || a.created_at || '').getTime();
          const db = new Date(b.study_date || b.created_at || '').getTime();
          return da - db;
        });
        this.historyLoading = false;
      },
      error: () => {
        this.historyError   = true;
        this.historyLoading = false;
      }
    });
  }

  /** Build the set of chart points for the SVG timeline. */
  get timelinePoints(): TimelinePoint[] {
    if (this.historyStudies.length < 1) return [];

    const dates = this.historyStudies.map(s =>
      new Date(s.study_date || s.created_at || '').getTime()
    );
    const minT = Math.min(...dates);
    const maxT = Math.max(...dates);
    const range = maxT - minT || 1; // avoid /0 for single-point series

    return this.historyStudies.map((s, i) => {
      const t    = dates[i];
      const xRel = (t - minT) / range;
      const br   = s.birads_global ?? '';
      const num  = this._biradsNum(br);
      const color = biradsColor(br as any) || '#6b7280';
      const d    = new Date(t);
      const dateLabel = isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
      return { study: s, xRel, biRadsNum: num, color, dateLabel };
    });
  }

  /**
   * Convert a BI-RADS string to a numeric Y level (1–6).
   * Unknown / empty → 0, used to render at the mid-baseline.
   */
  private _biradsNum(br: string): number {
    const n = parseFloat(br);
    if (!isNaN(n) && n >= 0 && n <= 6) return n;
    return 0;
  }

  /**
   * Map a TimelinePoint to SVG (x, y) coordinates.
   * ViewBox is 0 0 360 100 with plot area x:[30,350] y:[10,80].
   */
  svgCoords(pt: TimelinePoint): { x: number; y: number } {
    const plotX0 = 30, plotX1 = 350;
    const plotY0 = 10, plotY1 = 80; // top (BI-RADS 6) .. bottom (BI-RADS 0/1)
    const x = plotX0 + pt.xRel * (plotX1 - plotX0);
    // BI-RADS 6 → y=plotY0; BI-RADS 1 → y=plotY1; 0 → midpoint
    const level = pt.biRadsNum > 0 ? pt.biRadsNum : 3.5;
    const y = plotY1 - ((level - 1) / 5) * (plotY1 - plotY0);
    return { x, y };
  }

  /** Polyline points string for the SVG <polyline> element. */
  get polylinePoints(): string {
    return this.timelinePoints
      .map(pt => { const c = this.svgCoords(pt); return `${c.x},${c.y}`; })
      .join(' ');
  }

  /** Open a history study in VP1 (side-by-side comparison). */
  compareStudy(pt: TimelinePoint) {
    const fp = pt.study.file_path;
    if (!fp) return;
    this.compareWith.emit(fp);
  }
}
