import { Injectable, inject, signal } from '@angular/core';
import { VP, ROI } from '../../shared/models/types';
import { ApiService, ClinicalFields, FindingDTO, OpenStudyResponse, PatientDTO, StudyListItem } from './api.service';

export interface StudyMetadata {
  modality?: string;
  description?: string;
  windowCenter?: number;
  windowWidth?: number;
  bitsStored?: number;
  width?: number;
  height?: number;
}

export interface HistoryEntry {
  name: string;
  dataUrl: string;
  date: string;
  studyId?: string;
  filePath?: string;
}

@Injectable({ providedIn: 'root' })
export class StudyService {
  private api = inject(ApiService);

  historyFiles: HistoryEntry[] = [];

  /** Active study returned from POST /api/studies. */
  currentStudyId = signal<string | null>(null);
  /** Last filesystem path opened (used by inference / windowing). */
  currentFilePath = signal<string | null>(null);
  /** Latest inference response — shown in the findings panel. */
  latestFindings = signal<FindingDTO[]>([]);
  /** Go Core connectivity state — surfaced in status bar. */
  backendOnline = signal<boolean>(false);
  /** AI sidecar state: 'ready' | 'down' | 'disabled' | 'unknown'. */
  aiEngineState = signal<'ready' | 'down' | 'disabled' | 'unknown'>('unknown');
  /** Reason text when AI is disabled (auto-disabled or via env var). */
  aiEngineReason = signal<string>('');
  /** Studies persisted on the backend (shown in History tab). */
  backendStudies = signal<StudyListItem[]>([]);
  /** DICOM metadata for the active study (WW/WC, modality, dims). */
  currentMetadata = signal<StudyMetadata | null>(null);
  /** Clinical report fields for the active study. */
  currentClinical = signal<ClinicalFields | null>(null);
  /** Patient associated with the active study. */
  currentPatient = signal<PatientDTO | null>(null);
  /** Total frames in the active DICOM (1 for single-frame). */
  currentFrameCount = signal<number>(1);
  /** 0-indexed frame currently displayed. */
  currentFrame = signal<number>(0);

  constructor() {
    this.refreshHealth();
    // Poll readiness every 5 s so the UI reflects sidecar transitions.
    setInterval(() => this.refreshHealth(), 5000);
  }

  /** Polls /healthz + /readyz and updates the connectivity signals. */
  refreshHealth() {
    this.api.health().subscribe(s => {
      const online = s.status === 'go-core-up';
      this.backendOnline.set(online);
      if (online && this.backendStudies().length === 0) this.refreshBackendStudies();
    });
    this.api.ready().subscribe(s => {
      const ai = s.ai_engine ?? 'unknown';
      this.aiEngineState.set(ai === 'ready' || ai === 'down' || ai === 'disabled' ? ai : 'unknown');
      this.aiEngineReason.set(s.ai_engine_reason ?? '');
    });
  }

  /** Fetches the persisted clinical report fields for the given study. */
  loadClinical(studyId: string) {
    this.api.getStudy(studyId).subscribe(s => {
      if (!s) return;
      this.currentClinical.set({
        birads_global:  s.birads_global  ?? '',
        conclusion:     s.conclusion     ?? '',
        recommendation: s.recommendation ?? '',
        signed_by:      s.signed_by      ?? '',
        signed_at:      s.signed_at      ?? '',
      });
      if (s.patient_uuid && (!this.currentPatient() || this.currentPatient()!.id !== s.patient_uuid)) {
        this.api.getPatient(s.patient_uuid).subscribe(p => {
          if (p) this.currentPatient.set(p);
        });
      }
    });
  }

  /** Saves edits to the current patient and refreshes the local signal. */
  savePatient(updates: Partial<PatientDTO>): void {
    const p = this.currentPatient();
    if (!p) return;
    this.api.patchPatient(p.id, updates).subscribe(updated => {
      if (updated) this.currentPatient.set(updated);
    });
  }

  /** Stores the parsed DICOM metadata so the viewer can use WW/WC defaults. */
  private applyOpenStudyMetadata(resp: OpenStudyResponse) {
    this.currentMetadata.set({
      modality:     resp.modality,
      description:  resp.description,
      windowCenter: resp.window_center || undefined,
      windowWidth:  resp.window_width  || undefined,
      bitsStored:   resp.bits_stored   || undefined,
      width:        resp.width,
      height:       resp.height,
    });
    this.currentFrameCount.set(resp.frame_count && resp.frame_count > 1 ? resp.frame_count : 1);
    this.currentFrame.set(0);
  }

  /**
   * Switches the viewport to a specific frame of the current multi-frame DICOM.
   * Fetches the rendered preview PNG for the requested frame from the backend.
   */
  navigateFrame(frameIdx: number, vpIdx: number, vp: VP, onLoaded: (vpIdx: number) => void) {
    const studyId = this.currentStudyId();
    if (!studyId) return;
    const total = this.currentFrameCount();
    const frame = Math.max(0, Math.min(frameIdx, total - 1));
    this.currentFrame.set(frame);

    const previewURL = this.api.previewURL(studyId, undefined, undefined, frame);
    const img = new Image();
    img.onload = () => {
      vp.loadedImage = img;
      vp.imageDataUrl = previewURL;
      onLoaded(vpIdx);
    };
    img.src = previewURL;
  }

  /** Reloads the study list from the Go Core. */
  refreshBackendStudies() {
    this.api.listStudies().subscribe(list => this.backendStudies.set(list));
  }

  /**
   * Loads a File into the given VP and pushes it to historyFiles.
   * Also registers the study in the Go Core (best-effort).
   */
  loadFile(file: File, vpIdx: number, vp: VP, onLoaded: (vpIdx: number) => void) {
    vp.imageName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      vp.imageDataUrl = result;
      const img = new Image();
      img.onload = () => {
        vp.loadedImage = img;
        onLoaded(vpIdx);

        const fakePath = `/uploads/${file.name}`;
        this.currentFilePath.set(fakePath);
        this.latestFindings.set([]);
        this.currentFrameCount.set(1);
        this.currentFrame.set(0);

        const entry: HistoryEntry = {
          name: file.name,
          dataUrl: result,
          date: new Date().toLocaleString('pt-BR'),
          filePath: fakePath
        };
        this.historyFiles.unshift(entry);
        if (this.historyFiles.length > 20) this.historyFiles.pop();

        // Best-effort: register in backend.
        this.api.openStudy(fakePath).subscribe(resp => {
          if (resp?.id) {
            this.currentStudyId.set(resp.id);
            this.applyOpenStudyMetadata(resp);
            entry.studyId = resp.id;
            this.refreshBackendStudies();
          }
        });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Loads a file from a native path (Wails desktop mode).
   * Since there's no File object, the image is loaded via URL.
   */
  loadNativePath(filePath: string, vpIdx: number, vp: VP, onLoaded: (vpIdx: number) => void) {
    vp.imageName = filePath.split(/[\\/]/).pop() ?? filePath;
    this.currentFilePath.set(filePath);
    this.latestFindings.set([]);

    // The browser can't decode .dcm; we open the study server-side and load
    // the rendered preview PNG (with WW/WC applied) as the canvas image.
    this.api.openStudy(filePath).subscribe(resp => {
      if (!resp?.id) return;
      this.currentStudyId.set(resp.id);
      this.applyOpenStudyMetadata(resp);
      this.currentPatient.set(resp.patient ?? null);
      this.refreshBackendStudies();
      this.loadClinical(resp.id);

      const previewURL = this.api.previewURL(resp.id);
      const img = new Image();
      img.onload = () => {
        vp.loadedImage = img;
        vp.imageDataUrl = previewURL;
        onLoaded(vpIdx);

        const entry: HistoryEntry = {
          name: vp.imageName,
          dataUrl: previewURL,
          date: new Date().toLocaleString('pt-BR'),
          filePath,
          studyId: resp.id,
        };
        this.historyFiles.unshift(entry);
        if (this.historyFiles.length > 20) this.historyFiles.pop();
      };
      img.src = previewURL;
    });
  }

  /**
   * Re-loads a history entry into the given VP.
   * If studyId is available, also restores annotations from the backend.
   */
  loadHistoryEntry(
    entry: HistoryEntry,
    vpIdx: number,
    vp: VP,
    onLoaded: (vpIdx: number) => void,
    onAnnotations?: (rois: Partial<ROI>[]) => void
  ) {
    vp.imageName = entry.name;
    vp.imageDataUrl = entry.dataUrl;
    const img = new Image();
    img.onload = () => {
      vp.loadedImage = img;
      onLoaded(vpIdx);
      if (entry.studyId) this.currentStudyId.set(entry.studyId);
      if (entry.filePath) this.currentFilePath.set(entry.filePath);
      this.latestFindings.set([]);

      // Step 4 — restore annotations from backend.
      if (entry.studyId && onAnnotations) {
        this.api.getAnnotations(entry.studyId).subscribe(res => {
          const rois: Partial<ROI>[] = (res.annotations ?? []).map((a, i) => {
            // Backend returns entity.Annotation with bbox nested as {x,y,w,h}.
            const bx = a.bbox?.x ?? a.x ?? 0;
            const by = a.bbox?.y ?? a.y ?? 0;
            const bw = a.bbox?.w ?? a.w ?? 0;
            const bh = a.bbox?.h ?? a.h ?? 0;
            return {
              id: i + 1,
              annotationId: a.id,
              x: bx + bw / 2,
              y: by + bh / 2,
              rx: bw / 2,
              ry: bh / 2,
              shape: (a.kind === 'rect' || a.kind === 'bbox') ? 'rect' : 'ellipse',
              birads: null,
              label: '',
              notes: '',
              isSelected: false,
              audioDurationMs: a.audio_duration_ms ?? 0,
            };
          });
          onAnnotations(rois);
        });
      }
    };
    img.src = entry.dataUrl;
  }

  /** Triggers POST /api/tasks/predict and stores the results. */
  runInference() {
    const path = this.currentFilePath();
    if (!path) return;
    const studyId = this.currentStudyId() ?? undefined;
    this.api.runInference(path, studyId).subscribe(resp => {
      this.latestFindings.set(resp?.findings ?? []);
    });
  }

  /** Persists current ROIs as annotations on the active study. */
  saveAnnotations(rois: VP['rois'], onDone?: (ok: boolean) => void) {
    const studyId = this.currentStudyId();
    if (!studyId) { onDone?.(false); return; }
    this.api.saveAnnotations(studyId, rois).subscribe(ok => onDone?.(ok));
  }
}
