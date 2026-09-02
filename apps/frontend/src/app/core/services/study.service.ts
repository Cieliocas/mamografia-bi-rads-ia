import { Injectable, computed, inject, signal } from '@angular/core';
import { VP, ROI } from '../../shared/models/types';
import { ApiService, AiModelState, ClinicalFields, FindingDTO, OpenStudyResponse, PatientDTO, StudyListItem } from './api.service';

export interface StudyMetadata {
  // Image display
  modality?: string;
  description?: string;
  windowCenter?: number;
  windowWidth?: number;
  bitsStored?: number;
  bitsAllocated?: number;
  width?: number;
  height?: number;
  rows?: number;
  columns?: number;
  pixelSpacing?: number;
  photometric?: string;
  frameCount?: number;

  // Patient
  patientName?: string;
  patientBirthDate?: string;
  patientSex?: string;

  // Study
  studyDate?: string;
  studyDescription?: string;
  accessionNumber?: string;
  studyInstanceUID?: string;

  // Series
  seriesNumber?: string;
  laterality?: string;
  viewPosition?: string;
  bodyPartExamined?: string;

  // Equipment
  manufacturer?: string;
  manufacturerModel?: string;
  institutionName?: string;
  stationName?: string;

  // Acquisition
  kvp?: number;
  exposureTimeMs?: number;
  tubeCurrentMa?: number;
  exposureMas?: number;
  compressionForceN?: number;
  imagerPixelSpacing?: number;
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
  /** True while an inference request is in flight (2-3s on CPU). */
  inferenceRunning = signal<boolean>(false);
  /** model_id of the last inference — distinguishes real cascade from mock. */
  lastModelId = signal<string>('');
  /** Go Core connectivity state — surfaced in status bar. */
  backendOnline = signal<boolean>(false);
  /** AI sidecar state: 'ready' | 'down' | 'disabled' | 'unknown'. */
  aiEngineState = signal<'ready' | 'down' | 'disabled' | 'unknown'>('unknown');
  /**
   * Estado do MODELO, que é diferente do estado do serviço.
   *
   * O serviço pode estar perfeitamente no ar servindo achados sintéticos do
   * backend mock. Tratar isso como "IA disponível" faz a ferramenta apresentar
   * resultados fabricados como se fossem do modelo — o pior modo de falha
   * possível numa demonstração clínica.
   */
  aiModelState = signal<AiModelState>('none');
  /** Atalho: há achados na tela que NÃO vieram de um modelo treinado. */
  aiSimulated = computed(() => this.aiModelState() === 'simulated');
  /** Motivo concreto da ausência de modelo — é o que torna o alerta acionável. */
  aiModelReason = signal<string>('');
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
  /**
   * Non-empty when the backend reports a corrupted database.
   * Contains the human-readable Portuguese error message to display to the user.
   */
  dbCorrupted = signal<string>('');

  // ── Series navigation ──────────────────────────────────────────────────────
  /** All image paths in the current folder/series (populated by FilesPanel). */
  seriesFiles = signal<string[]>([]);
  /** 0-based index of the currently displayed file within seriesFiles. */
  seriesIdx   = signal<number>(-1);

  /** Store a series context when the user opens a file from the Files panel. */
  setSeriesContext(files: string[], idx: number) {
    this.seriesFiles.set(files);
    this.seriesIdx.set(idx);
  }

  /**
   * Advances the series by `delta` (+1 = next, -1 = prev).
   * Updates seriesIdx and returns the new path, or null if out of bounds.
   */
  seriesPathAt(delta: number): string | null {
    const files = this.seriesFiles();
    if (!files.length) return null;
    const next = this.seriesIdx() + delta;
    if (next < 0 || next >= files.length) return null;
    this.seriesIdx.set(next);
    return files[next];
  }

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
      // Surface DB corruption to the UI.
      if (s.db_status === 'corrupted') {
        this.dbCorrupted.set(
          s.db_error ??
          'Banco de dados corrompido — use Exportar › Restaurar backup para recuperar os dados.'
        );
      } else {
        this.dbCorrupted.set('');
      }
      if (online && this.backendStudies().length === 0) this.refreshBackendStudies();
    });
    this.api.ready().subscribe(s => {
      const ai = s.ai_engine ?? 'unknown';
      this.aiEngineState.set(ai === 'ready' || ai === 'down' || ai === 'disabled' ? ai : 'unknown');
      const m = s.ai_model;
      this.aiModelState.set(m === 'real' || m === 'simulated' ? m : 'none');
      this.aiModelReason.set(s.ai_model_reason ?? '');
      this.aiEngineReason.set(s.ai_engine_reason ?? '');
    });
  }

  /** Fetches the persisted clinical report fields for the given study. */
  loadClinical(studyId: string) {
    this.api.getStudy(studyId).subscribe(s => {
      if (!s) return;
      this.currentClinical.set({
        birads_global:  s.birads_global  ?? '',
        birads_density: s.birads_density ?? '',
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
      // Display
      modality:        resp.modality,
      description:     resp.description,
      windowCenter:    resp.window_center    || undefined,
      windowWidth:     resp.window_width     || undefined,
      bitsStored:      resp.bits_stored      || undefined,
      bitsAllocated:   resp.bits_allocated   || undefined,
      width:           resp.width,
      height:          resp.height,
      rows:            resp.rows             || undefined,
      columns:         resp.columns          || undefined,
      pixelSpacing:    resp.pixel_spacing    || undefined,
      photometric:     resp.photometric      || undefined,
      frameCount:      resp.frame_count      || undefined,
      // Patient
      patientName:     resp.patient_name     || undefined,
      patientBirthDate: resp.patient_birth_date || undefined,
      patientSex:      resp.patient_sex      || undefined,
      // Study
      studyDate:       resp.study_date       || undefined,
      studyDescription: resp.study_description || undefined,
      accessionNumber: resp.accession_number || undefined,
      studyInstanceUID: resp.study_instance_uid || undefined,
      // Series
      seriesNumber:    resp.series_number    || undefined,
      laterality:      resp.laterality       || undefined,
      viewPosition:    resp.view_position    || undefined,
      bodyPartExamined: resp.body_part_examined || undefined,
      // Equipment
      manufacturer:    resp.manufacturer     || undefined,
      manufacturerModel: resp.manufacturer_model || undefined,
      institutionName: resp.institution_name || undefined,
      stationName:     resp.station_name     || undefined,
      // Acquisition
      kvp:             resp.kvp              || undefined,
      exposureTimeMs:  resp.exposure_time_ms || undefined,
      tubeCurrentMa:   resp.tube_current_ma  || undefined,
      exposureMas:     resp.exposure_mas     || undefined,
      compressionForceN: resp.compression_force_n || undefined,
      imagerPixelSpacing: resp.imager_pixel_spacing || undefined,
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

      // Store pixel spacing on the VP so ruler calibration is per-viewport.
      vp.pixelSpacing = resp.pixel_spacing && resp.pixel_spacing > 0
        ? resp.pixel_spacing : null;

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
          const rois: Partial<ROI>[] = (res.annotations ?? [])
            // A rejected suggestion is stored as an annotation so it survives
            // for retraining, but it is not a marking: it has no human geometry
            // and must never come back onto the image as a ROI.
            .filter(a => a.source !== 'ai_rejected')
            .map((a, i) => {
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
              label: a.label ?? '',
              notes: a.notes ?? '',
              isSelected: false,
              audioDurationMs: a.audio_duration_ms ?? 0,
              // Provenance survives the round-trip, so a re-save does not
              // downgrade an AI-derived annotation back to "manual".
              source: a.source,
              modelId: a.model_id,
              aiConfidence: a.ai_confidence,
              aiKind: a.ai_kind,
              aiBirads: a.ai_birads,
              aiBbox: a.ai_bbox,
            };
          });
          onAnnotations(rois);
        });
      }
    };
    img.src = entry.dataUrl;
  }

  /**
   * Triggers POST /api/tasks/predict and hands the suggestions to `vp`.
   *
   * Suggestions belong to the viewport, not to the service, so that opening
   * another image clears them with the rest of that viewport's state.
   */
  runInference(vp?: VP, onDone?: (ok: boolean) => void) {
    const path = this.currentFilePath();
    if (!path || this.inferenceRunning()) { onDone?.(false); return; }
    const studyId = this.currentStudyId() ?? undefined;
    this.inferenceRunning.set(true);
    this.api.runInference(path, studyId).subscribe(resp => {
      this.inferenceRunning.set(false);
      // The API layer swallows HTTP errors into null; the caller owns the
      // user-facing message (the panel raises a toast).
      if (!resp) { onDone?.(false); return; }
      this.latestFindings.set(resp.findings ?? []);
      this.lastModelId.set(resp.model_id ?? '');
      if (vp) {
        vp.aiFindings = (resp.findings ?? []).map((f, i) => ({
          id:         f.id || `ai-${Date.now()}-${i}`,
          kind:       f.kind || 'finding',
          birads:     f.birads ?? '',
          confidence: f.confidence ?? 0,
          // Zero-area boxes mean an image-level assessment: no region to draw.
          bbox:       f.bbox && f.bbox.w > 0 && f.bbox.h > 0 ? f.bbox : undefined,
          notes:      f.notes ?? '',
          modelId:    resp.model_id ?? '',
          status:     'pending' as const,
        }));
      }
      onDone?.(true);
    });
  }

  /**
   * Persists the viewport's annotations: the radiologist's marks plus the
   * suggestions they rejected.
   *
   * Takes the whole viewport rather than just the ROIs because a rejection is
   * an annotation too — it lives in `aiFindings`, and it is lost the moment the
   * viewport is cleared if nobody writes it down.
   */
  saveAnnotations(vp: VP, onDone?: (ok: boolean) => void) {
    const studyId = this.currentStudyId();
    if (!studyId) { onDone?.(false); return; }
    const rejected = (vp.aiFindings ?? []).filter(f => f.status === 'rejected');
    this.api.saveAnnotations(studyId, vp.rois, rejected).subscribe(ok => onDone?.(ok));
  }
}
