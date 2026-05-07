import { Component, Output, EventEmitter, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Trash2, Copy, Clipboard, Undo2, Redo2,
  Circle, Square, Columns, RotateCw, Download, FileText, FileJson,
  Mic, MicOff, Play, Pause, X as XIcon
} from 'lucide-angular';

import { ViewerStateService } from '../../core/services/viewer-state.service';
import { StudyService } from '../../core/services/study.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { biradsColor } from '../../shared/models/types';
import type { BiRads } from '../../shared/models/types';

@Component({
  selector: 'app-findings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './findings-panel.component.html',
})
export class FindingsPanelComponent implements OnDestroy {

  readonly state = inject(ViewerStateService);
  readonly study = inject(StudyService);
  readonly api   = inject(ApiService);
  readonly toast = inject(ToastService);

  readonly icons = { Trash2, Copy, Clipboard, Undo2, Redo2, Circle, Square, Columns, RotateCw, Download, FileText, FileJson, Mic, MicOff, Play, Pause, XIcon };

  // ── Audio recording ────────────────────────────────────────────────────────
  audioRecording = false;
  audioRecordingSec = 0;
  audioUploading = false;
  audioError = '';

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStart = 0;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;

  /** Audio element for playback (one shared instance per panel). */
  audioPlayer: HTMLAudioElement | null = null;
  audioPlaying = false;
  audioPlayingId = '';

  ngOnDestroy() {
    this.stopRecording(false);
    this.audioPlayer?.pause();
  }

  audioPlayerSrc(annotationId: string): string {
    return this.api.annotationAudioURL(annotationId);
  }

  togglePlayback(annotationId: string) {
    if (this.audioPlaying && this.audioPlayingId === annotationId) {
      this.audioPlayer?.pause();
      this.audioPlaying = false;
      return;
    }
    if (!this.audioPlayer) {
      this.audioPlayer = new Audio();
      this.audioPlayer.onended = () => { this.audioPlaying = false; };
      this.audioPlayer.onpause = () => { this.audioPlaying = false; };
    }
    this.audioPlayer.src = this.audioPlayerSrc(annotationId);
    this.audioPlayingId = annotationId;
    this.audioPlayer.play().then(() => { this.audioPlaying = true; }).catch(() => {});
  }

  async startRecording() {
    this.audioError = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const opts: MediaRecorderOptions = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : {};
      this.mediaRecorder = new MediaRecorder(stream, opts);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.start(250);
      this.recordingStart = Date.now();
      this.audioRecordingSec = 0;
      this.audioRecording = true;
      this.recordingTimer = setInterval(() => {
        this.audioRecordingSec = Math.floor((Date.now() - this.recordingStart) / 1000);
      }, 500);
    } catch {
      this.audioError = 'Microfone não disponível';
    }
  }

  stopRecording(upload = true) {
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    if (!this.mediaRecorder) return;
    const mr = this.mediaRecorder;
    this.mediaRecorder = null;
    this.audioRecording = false;

    mr.stream.getTracks().forEach(t => t.stop());

    if (!upload) { this.audioChunks = []; return; }

    mr.onstop = () => {
      const durationMs = Date.now() - this.recordingStart;
      const blob = new Blob(this.audioChunks, { type: mr.mimeType || 'audio/webm' });
      this.audioChunks = [];
      const roi = this.state.selectedROI;
      if (!roi?.annotationId) { this.audioError = 'Salve as anotações antes de gravar áudio'; return; }
      this.audioUploading = true;
      this.api.uploadAnnotationAudio(roi.annotationId, blob, durationMs).subscribe(res => {
        this.audioUploading = false;
        if (res) {
          roi.audioDurationMs = res.audio_duration_ms;
          this.toast.success('Nota de voz salva');
        } else {
          this.audioError = 'Falha ao enviar áudio';
          this.toast.error('Falha ao enviar nota de voz');
        }
      });
    };
    mr.stop();
  }

  deleteAudio() {
    const roi = this.state.selectedROI;
    if (!roi?.annotationId) return;
    this.api.deleteAnnotationAudio(roi.annotationId).subscribe(ok => {
      if (ok) {
        roi.audioDurationMs = 0;
        this.toast.info('Nota de voz removida');
      } else {
        this.toast.error('Falha ao remover nota de voz');
      }
    });
  }

  formatAudioDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Export modal ───────────────────────────────────────────────────────────
  showExportModal = false;
  exportStudyIds: string[] = [];

  openExportModal() {
    const sid = this.study.currentStudyId();
    this.exportStudyIds = sid ? [sid] : [];
    this.showExportModal = true;
  }
  exportJSON()   {
    this.api.downloadExport('json', this.exportStudyIds);
    this.showExportModal = false;
    this.toast.info('Download JSON iniciado');
  }
  exportCSV()    {
    this.api.downloadExport('csv',  this.exportStudyIds);
    this.showExportModal = false;
    this.toast.info('Download CSV iniciado');
  }
  exportReport() {
    const sid = this.study.currentStudyId();
    if (sid) this.api.openReport(sid);
    this.showExportModal = false;
  }
  exportBackup() {
    this.api.downloadBackup();
    this.showExportModal = false;
    this.toast.info('Download backup iniciado');
  }
  exportMarkedImage() {
    const sid = this.study.currentStudyId();
    if (sid) this.api.downloadAnnotatedPNG(sid);
    this.showExportModal = false;
    this.toast.info('Download imagem marcada iniciado');
  }

  // ── Clinical fields ────────────────────────────────────────────────────────
  clinical = {
    birads_global: '',
    conclusion: '',
    recommendation: '',
    signed_by: '',
  };
  clinicalSaving = false;
  clinicalSavedAt = '';

  // ── Patient editor ─────────────────────────────────────────────────────────
  patient = { name: '', birth_date: '', sex: '' };
  patientSaving = false;

  constructor() {
    // Hydrate the form when a study (re)loads or the backend pushes clinical data.
    effect(() => {
      const c = this.study.currentClinical();
      if (!c) return;
      this.clinical = {
        birads_global:  c.birads_global  ?? '',
        conclusion:     c.conclusion     ?? '',
        recommendation: c.recommendation ?? '',
        signed_by:      c.signed_by      ?? '',
      };
      this.clinicalSavedAt = c.signed_at ?? '';
    });
    // Hydrate patient form whenever the active patient changes.
    effect(() => {
      const p = this.study.currentPatient();
      if (!p) return;
      this.patient = {
        name:       p.name       ?? '',
        birth_date: p.birth_date ?? '',
        sex:        p.sex        ?? '',
      };
    });
  }

  savePatient() {
    this.patientSaving = true;
    this.study.savePatient(this.patient);
    setTimeout(() => {
      this.patientSaving = false;
      this.toast.success('Paciente salvo');
    }, 500);
  }

  saveClinical() {
    const sid = this.study.currentStudyId();
    if (!sid) return;
    this.clinicalSaving = true;
    const payload = {
      ...this.clinical,
      signed_at: new Date().toLocaleString('pt-BR'),
    };
    this.api.patchClinical(sid, payload).subscribe(ok => {
      this.clinicalSaving = false;
      if (ok) {
        this.clinicalSavedAt = payload.signed_at;
        this.toast.success('Laudo salvo');
      } else {
        this.toast.error('Falha ao salvar laudo');
      }
    });
  }

  // ── Backend integration ─────────────────────────────────────────────────────
  runInference() { this.study.runInference(); }
  persist() {
    this.study.saveAnnotations(this.state.rois, ok => {
      if (ok) this.toast.success('Anotações salvas');
      else    this.toast.error('Falha ao salvar anotações');
    });
  }

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
