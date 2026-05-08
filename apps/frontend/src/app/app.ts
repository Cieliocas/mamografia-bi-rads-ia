import {
  Component, OnInit, OnDestroy, HostListener, ViewChild, inject
} from '@angular/core';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  FolderOpen, History, Users, BarChart3, Wrench,
  ChevronRight, ChevronLeft, Sparkles
} from 'lucide-angular';
import { ApiService, PatientDTO, PatientStudyDTO } from './core/services/api.service';
import { WindowToggleMaximise } from './wailsjs/runtime/runtime';

import { ViewerStateService } from './core/services/viewer-state.service';
import { StudyService }       from './core/services/study.service';
import { ToastService }       from './core/services/toast.service';
import { ViewerComponent }    from './features/viewer/viewer.component';
import { FindingsPanelComponent } from './features/annotations/findings-panel.component';
import { SplashComponent }    from './shared/components/splash/splash.component';
import { ConfirmModalComponent } from './shared/components/confirm-modal/confirm-modal.component';
import { ToastComponent }     from './shared/components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LucideAngularModule,
    ViewerComponent, FindingsPanelComponent,
    SplashComponent, ConfirmModalComponent, ToastComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, OnDestroy {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);
  readonly toast = inject(ToastService);

  // ── Patients tab state ────────────────────────────────────────────────────
  patientQuery = '';
  patients: PatientDTO[] = [];
  selectedPatient: PatientDTO | null = null;
  patientStudies: PatientStudyDTO[] = [];

  loadPatients() {
    this.api.listPatients(this.patientQuery).subscribe(list => this.patients = list);
  }
  selectPatient(p: PatientDTO) {
    this.selectedPatient = p;
    this.api.listPatientStudies(p.id).subscribe(list => this.patientStudies = list);
  }

  // ── Splash ────────────────────────────────────────────────────────────────
  showSplash = true;
  progress   = 0;
  private splashTick:     ReturnType<typeof setInterval> | null = null;
  private splashFailSafe: ReturnType<typeof setTimeout>  | null = null;
  private autoSaveSub:    Subscription | null = null;

  readonly icons = { FolderOpen, History, Users, BarChart3, Wrench, ChevronRight, ChevronLeft, Sparkles };

  /** Double-click na titlebar → zoom padrão macOS. */
  toggleMaximise() {
    try { WindowToggleMaximise(); } catch { /* browser/dev mode sem runtime Wails */ }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.splashTick = setInterval(() => {
      this.progress += 2;
      if (this.progress >= 100) { this.progress = 100; this.finishSplash(450); }
    }, 30);
    this.splashFailSafe = setTimeout(() => this.finishSplash(0), 8000);

    // Autosave: persist annotations 1.5s after the last change, but only when
    // a study is bound to the active VP. Saves are no-ops on the backend if
    // currentStudyId is null, so we guard up-front.
    this.autoSaveSub = this.state.annotationsChanged$
      .pipe(debounceTime(1500))
      .subscribe(vpIdx => {
        if (this.study.currentStudyId()) {
          this.study.saveAnnotations(this.state.vp[vpIdx].rois, ok => {
            if (!ok) this.toast.error('Falha ao salvar anotações');
          });
        }
      });
  }

  ngOnDestroy() {
    if (this.splashTick)     clearInterval(this.splashTick);
    if (this.splashFailSafe) clearTimeout(this.splashFailSafe);
    if (this.autoSaveSub)    this.autoSaveSub.unsubscribe();
  }

  private finishSplash(delay = 0) {
    if (this.splashTick)     { clearInterval(this.splashTick);  this.splashTick = null; }
    if (this.splashFailSafe) { clearTimeout(this.splashFailSafe); this.splashFailSafe = null; }
    setTimeout(() => { this.showSplash = false; }, delay);
  }

  // ── Modal helpers (delegated to state, triggered by child events) ─────────
  get modalTitle(): string {
    return this.state.pendingResetAll ? 'Limpar todas as anotações?' : 'Remover ROI selecionada?';
  }

  onAskDelete() {
    if (this.state.selectedROI) this.state.askDelete(this.state.selectedROI);
  }

  onConfirmModal() {
    this.state.confirmModal((i) => this.viewerRef?.draw(i));
  }

  onCancelModal() { this.state.closeModal(); }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.viewerRef) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const active = document.activeElement as HTMLElement;
    const inField = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';

    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.state.undo(this.state.activeVp, (i) => this.viewerRef!.draw(i)); }
    else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.state.redo(this.state.activeVp, (i) => this.viewerRef!.draw(i)); }
    else if (ctrl && e.key === 'c') { e.preventDefault(); this.state.copyROI(); }
    else if (ctrl && e.key === 'v') { e.preventDefault(); this.state.pasteROI((i) => this.viewerRef!.draw(i)); }
    else if (!inField && (e.key === 'Delete' || e.key === 'Backspace')) {
      const vp = this.state.activeVPData;
      if (vp.selectedROIId !== null) {
        this.state.snap(this.state.activeVp);
        vp.rois = vp.rois.filter(r => r.id !== vp.selectedROIId);
        vp.selectedROIId = null; this.state.selectedROI = null;
        this.viewerRef!.draw(this.state.activeVp);
      }
    }
    else if (e.key === 'Escape') { this.state.deselectROI((i) => this.viewerRef!.draw(i)); }
    else if (e.key === 'p' || e.key === 'P') this.state.setTool('pan');
    else if (e.key === 'r' || e.key === 'R') this.state.setTool('roi');
    else if (e.key === 'l' || e.key === 'L') this.state.setTool('ruler');
    // Zoom
    else if (!inField && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      this.state.zoomIn(this.state.activeVp, (i) => this.viewerRef!.draw(i));
    }
    else if (!inField && e.key === '-') {
      e.preventDefault();
      this.state.zoomOut(this.state.activeVp, (i) => this.viewerRef!.draw(i));
    }
    else if (!inField && (e.key === '0' || e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      this.viewerRef!.fitScreen(this.state.activeVp);
    }
    // BI-RADS quick set on selected ROI: 1, 2, 3, 4 (cycles 4A→4B→4C), 5, 6
    else if (!inField && this.state.selectedROI && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      this.state.setBirads(quickBirads(e.key, this.state.selectedROI.birads),
        (i) => this.viewerRef!.draw(i));
    }
    // Save current annotations explicitly
    else if (ctrl && e.key === 's') {
      e.preventDefault();
      this.study.saveAnnotations(this.state.activeVPData.rois, ok => {
        if (ok) this.toast.success('Anotações salvas');
        else    this.toast.error('Falha ao salvar anotações');
      });
    }
  }

  // ── ViewerComponent reference (for keyboard shortcuts) ───────────────────
  @ViewChild('viewer') viewerRef?: ViewerComponent;
}

import type { BiRads } from './shared/models/types';

/** Maps a digit key to a BI-RADS value, cycling 4A→4B→4C when '4' repeats. */
function quickBirads(key: string, current: BiRads): BiRads {
  if (key === '4') {
    if (current === '4A') return '4B';
    if (current === '4B') return '4C';
    return '4A';
  }
  return key as BiRads;
}
