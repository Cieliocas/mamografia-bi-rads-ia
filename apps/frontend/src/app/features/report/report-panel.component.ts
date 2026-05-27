import {
  Component, OnInit, OnDestroy, inject, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import {
  LucideAngularModule,
  Save, FileText, Image, Download, RefreshCw,
  PenLine, CheckCircle, Loader, ClipboardList
} from 'lucide-angular';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { StudyService }  from '../../core/services/study.service';
import { ApiService, ClinicalFields } from '../../core/services/api.service';
import { ToastService }  from '../../core/services/toast.service';
import { biradsColor, BIRADS_INFO, BIRADS_CHIPS } from '../../shared/models/types';

@Component({
  selector: 'app-report-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './report-panel.component.html',
})
export class ReportPanelComponent implements OnInit, OnDestroy {

  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);
  readonly toast = inject(ToastService);

  readonly icons = {
    Save, FileText, Image, Download, RefreshCw, PenLine, CheckCircle,
    Loader, ClipboardList
  };

  // ── Helpers re-exported for template ────────────────────────────────────────
  readonly biradsColor = biradsColor;
  readonly biradsInfo  = BIRADS_INFO;
  readonly biradsChips = BIRADS_CHIPS;

  // ── Form state ───────────────────────────────────────────────────────────────
  biradsGlobal  = '';
  conclusion    = '';
  recommendation = '';
  signedBy      = '';
  signedAt      = '';

  // ── Save state ───────────────────────────────────────────────────────────────
  saving    = false;
  lastSaved = '';

  private changed$ = new Subject<void>();
  private subs = new Subscription();

  constructor() {
    // Reload form whenever the active study changes.
    effect(() => {
      const clinical = this.study.currentClinical();
      if (clinical) {
        this.biradsGlobal   = clinical.birads_global   ?? '';
        this.conclusion     = clinical.conclusion      ?? '';
        this.recommendation = clinical.recommendation  ?? '';
        this.signedBy       = clinical.signed_by       ?? '';
        this.signedAt       = clinical.signed_at       ?? '';
      } else {
        this.resetForm();
      }
    });
  }

  ngOnInit() {
    // Auto-save with 800 ms debounce after any field change.
    this.subs.add(
      this.changed$.pipe(debounceTime(800), distinctUntilChanged()).subscribe(() => {
        this.persist();
      })
    );
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  /** Called by each form control on (ngModelChange). */
  onFieldChange() { this.changed$.next(); }

  /** Immediately persist to backend. */
  save() {
    this.persist(true);
  }

  private persist(manual = false) {
    const studyId = this.study.currentStudyId();
    if (!studyId) {
      if (manual) this.toast.show('Nenhum estudo aberto.', 'error');
      return;
    }
    this.saving = true;
    const fields: ClinicalFields = {
      birads_global:  this.biradsGlobal   || undefined,
      conclusion:     this.conclusion     || undefined,
      recommendation: this.recommendation || undefined,
      signed_by:      this.signedBy       || undefined,
      signed_at:      this.signedAt       || undefined,
    };
    this.api.patchClinical(studyId, fields).subscribe(ok => {
      this.saving = false;
      if (ok) {
        const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        this.lastSaved = now;
        // Keep the clinical signal in sync.
        this.study.currentClinical.set(fields);
        if (manual) this.toast.show('Laudo salvo.', 'success');
      } else if (manual) {
        this.toast.show('Falha ao salvar laudo.', 'error');
      }
    });
  }

  /** Auto-fill signed_by from current patient name and signed_at to now. */
  signNow() {
    const patient = this.study.currentPatient();
    this.signedBy = patient?.name || 'Radiologista';
    this.signedAt = new Date().toISOString();
    this.onFieldChange();
  }

  clearSignature() {
    this.signedBy = '';
    this.signedAt = '';
    this.onFieldChange();
  }

  // ── BI-RADS picker ─────────────────────────────────────────────────────────
  selectBirads(chip: string | null) {
    this.biradsGlobal = chip === this.biradsGlobal ? '' : (chip ?? '');
    this.onFieldChange();
  }

  // ── Export actions ─────────────────────────────────────────────────────────
  openReport() {
    const id = this.study.currentStudyId();
    if (!id) { this.toast.show('Nenhum estudo aberto.', 'error'); return; }
    this.api.openReport(id);
  }

  downloadAnnotatedPNG() {
    const id = this.study.currentStudyId();
    if (!id) { this.toast.show('Nenhum estudo aberto.', 'error'); return; }
    this.api.downloadAnnotatedPNG(id);
  }

  exportJSON() { this.api.downloadExport('json'); }
  exportCSV()  { this.api.downloadExport('csv');  }

  private resetForm() {
    this.biradsGlobal = '';
    this.conclusion   = '';
    this.recommendation = '';
    this.signedBy     = '';
    this.signedAt     = '';
    this.lastSaved    = '';
  }

  get hasStudy(): boolean  { return !!this.study.currentStudyId(); }
  get isSigned(): boolean  { return !!(this.signedBy && this.signedAt); }

  get signedAtLabel(): string {
    if (!this.signedAt) return '';
    try {
      return new Date(this.signedAt).toLocaleString('pt-BR');
    } catch { return this.signedAt; }
  }
}
