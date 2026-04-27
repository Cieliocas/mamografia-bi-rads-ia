import {
  Component, OnInit, OnDestroy, HostListener, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  FolderOpen, History, BarChart3, Wrench,
  ChevronRight, ChevronLeft
} from 'lucide-angular';

import { ViewerStateService } from './core/services/viewer-state.service';
import { StudyService }       from './core/services/study.service';
import { ViewerComponent }    from './features/viewer/viewer.component';
import { FindingsPanelComponent } from './features/annotations/findings-panel.component';
import { SplashComponent }    from './shared/components/splash/splash.component';
import { ConfirmModalComponent } from './shared/components/confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, LucideAngularModule,
    ViewerComponent, FindingsPanelComponent,
    SplashComponent, ConfirmModalComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, OnDestroy {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);

  // ── Splash ────────────────────────────────────────────────────────────────
  showSplash = true;
  progress   = 0;
  private splashTick:     ReturnType<typeof setInterval> | null = null;
  private splashFailSafe: ReturnType<typeof setTimeout>  | null = null;

  readonly icons = { FolderOpen, History, BarChart3, Wrench, ChevronRight, ChevronLeft };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.splashTick = setInterval(() => {
      this.progress += 2;
      if (this.progress >= 100) { this.progress = 100; this.finishSplash(450); }
    }, 30);
    this.splashFailSafe = setTimeout(() => this.finishSplash(0), 8000);
  }

  ngOnDestroy() {
    if (this.splashTick)     clearInterval(this.splashTick);
    if (this.splashFailSafe) clearTimeout(this.splashFailSafe);
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
  }

  // ── ViewerComponent reference (for keyboard shortcuts) ───────────────────
  @ViewChild('viewer') viewerRef?: ViewerComponent;
}
