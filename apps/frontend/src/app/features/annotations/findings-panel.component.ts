import { Component, Output, EventEmitter, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Trash2, Copy, Clipboard, Undo2, Redo2,
  Circle, Square, Columns, RotateCw, Download, Upload, FileText, FileJson,
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

  readonly icons = { Trash2, Copy, Clipboard, Undo2, Redo2, Circle, Square, Columns, RotateCw, Download, Upload, FileText, FileJson, Mic, MicOff, Play, Pause, XIcon };

  // ── Audio recording ────────────────────────────────────────────────────────
  audioRecording = false;
  audioRecordingSec = 0;
  audioUploading = false;
  audioError = '';

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStart = 0;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;

  // ── Real-time speech transcription (SpeechRecognition API) ─────────────────
  // Uses the browser-native SpeechRecognition (available in WKWebView on macOS).
  // Falls back gracefully when the API is not available.
  private recognition: any = null;
  /** Confirmed (final) transcript text accumulated during the current recording. */
  finalTranscript = '';
  /** Unstable (interim) text being recognised right now — shown live in UI. */
  interimTranscript = '';
  /**
   * Snapshot of the ROI's notes when dictation began. Dictated text is merged
   * onto this baseline each time a final segment arrives, so live updates are
   * idempotent and never duplicate previously-committed text.
   */
  private notesAtDictationStart = '';

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

  /**
   * Starts live voice dictation for the selected ROI.
   *
   * The transcribed text flows directly into the ROI's notes (the "Observações"
   * description block) in real time — no save required.  When the ROI is already
   * persisted (has an annotationId) the raw audio is ALSO captured via
   * MediaRecorder and uploaded as a permanent voice note on stop.
   */
  async startRecording() {
    const roi = this.state.selectedROI;
    if (!roi) return;
    this.audioError = '';

    // SpeechRecognition is the heart of dictation; without it there is no
    // speech-to-text, so bail early with a clear message.
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      this.audioError = 'Ditado por voz indisponível neste sistema';
      return;
    }

    // ── Optional: capture audio blob for a permanent voice note ──────────────
    // Only when the ROI is already persisted, since the upload endpoint keys
    // the file by annotationId (audio_handler requires an existing row).
    this.audioChunks = [];
    this.mediaRecorder = null;
    if (roi.annotationId) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const opts: MediaRecorderOptions = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? { mimeType: 'audio/webm;codecs=opus' }
          : {};
        this.mediaRecorder = new MediaRecorder(stream, opts);
        this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.start(250);
      } catch {
        // Mic capture failed — dictation can still proceed via SpeechRecognition.
        this.mediaRecorder = null;
      }
    }

    // ── Live speech-to-text → description block ──────────────────────────────
    this.finalTranscript        = '';
    this.interimTranscript      = '';
    this.notesAtDictationStart  = roi.notes ?? '';
    this.recognition = new SR();
    this.recognition.lang           = 'pt-BR';
    this.recognition.continuous     = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this.finalTranscript += text + ' ';
        } else {
          interim += text;
        }
      }
      this.interimTranscript = interim;
      // Commit confirmed text into the description block, live.
      this.applyDictationToNotes();
    };
    // Restart automatically on non-fatal errors (e.g. silence timeout).
    this.recognition.onerror = (e: any) => {
      if (e.error !== 'aborted' && this.audioRecording) {
        try { this.recognition?.start(); } catch {}
      }
    };
    this.recognition.start();

    this.recordingStart   = Date.now();
    this.audioRecordingSec = 0;
    this.audioRecording   = true;
    this.recordingTimer = setInterval(() => {
      this.audioRecordingSec = Math.floor((Date.now() - this.recordingStart) / 1000);
    }, 500);
  }

  /**
   * Merges the confirmed dictation transcript onto the notes baseline captured
   * when dictation started. Idempotent: re-running never duplicates text, so it
   * is safe to call on every SpeechRecognition result.
   */
  private applyDictationToNotes() {
    const roi = this.state.selectedROI;
    if (!roi) return;
    const dictated = this.finalTranscript.trim();
    const base     = this.notesAtDictationStart.trim();
    roi.notes = base && dictated ? `${base}\n${dictated}` : (dictated || base);
    this.state.updateROI((i) => this.drawRequest.emit(i));
  }

  stopRecording(upload = true) {
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    if (!this.audioRecording && !this.mediaRecorder && !this.recognition) return;
    this.audioRecording = false;

    // Stop SpeechRecognition first so we capture the final 'onresult' callback,
    // then commit whatever was confirmed into the description block.
    if (this.recognition) {
      try { this.recognition.stop(); } catch {}
      this.recognition = null;
    }
    this.applyDictationToNotes();
    this.interimTranscript     = '';
    const transcript           = this.finalTranscript.trim();
    this.finalTranscript       = '';
    this.notesAtDictationStart = '';

    // Stop & optionally upload the audio blob — only when one was captured
    // (i.e. the ROI was persisted at dictation start).
    const mr = this.mediaRecorder;
    this.mediaRecorder = null;
    if (!mr) return;
    mr.stream.getTracks().forEach(t => t.stop());
    if (!upload) { this.audioChunks = []; return; }

    mr.onstop = () => {
      const durationMs = Date.now() - this.recordingStart;
      const blob = new Blob(this.audioChunks, { type: mr.mimeType || 'audio/webm' });
      this.audioChunks = [];
      const roi = this.state.selectedROI;
      if (!roi?.annotationId) return; // blob only captured for persisted ROIs

      this.audioUploading = true;
      this.api.uploadAnnotationAudio(roi.annotationId, blob, durationMs, transcript || undefined).subscribe(res => {
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

  importBackupFile: File | null = null;
  importingBackup = false;

  onImportBackupSelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.importBackupFile = f;
  }

  importBackup() {
    if (!this.importBackupFile) return;
    this.importingBackup = true;
    this.api.restoreBackup(this.importBackupFile).subscribe(res => {
      this.importingBackup = false;
      this.importBackupFile = null;
      this.showExportModal = false;
      if (res?.status === 'pending_restart') {
        this.toast.success('Backup recebido! Feche e reabra o AIdentify para restaurar.');
      } else {
        this.toast.error('Falha ao importar backup');
      }
    });
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
