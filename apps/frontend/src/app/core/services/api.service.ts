import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ROI, geometryDiffers } from '../../shared/models/types';
import type { AiFinding, AnnotationSource, BBox } from '../../shared/models/types';
import { ToastService } from './toast.service';

// ─── DTOs (mirror Go DTOs in apps/core/internal/application/usecase) ──────────

export interface OpenStudyRequest {
  file_path: string;
}

export interface ClinicalFields {
  birads_global?: string;
  birads_density?: string;
  conclusion?: string;
  recommendation?: string;
  signed_by?: string;
  signed_at?: string;
}

export interface PatientDTO {
  id: string;
  external_id: string;
  name: string;
  birth_date?: string;
  sex?: string;
  notes?: string;
  created_at?: string;
}

export interface PatientStudyDTO {
  id: string;
  study_date: string;
  birads_global?: string;
  created_at?: string;
  file_path?: string;
}

export interface OpenStudyResponse {
  id: string;
  patient_id: string;
  patient_uuid?: string;
  patient?: PatientDTO;
  study_date: string;
  /** Image dimensions parsed from the DICOM PixelData. */
  width?: number;
  height?: number;
  /** Header fields useful for windowing and display. */
  modality?: string;
  description?: string;
  /** Default WW/WC from DICOM (0028,1050 / 0028,1051). 0 when absent. */
  window_center?: number;
  window_width?: number;
  bits_stored?: number;
  /** Total number of frames; 1 for single-frame DICOMs. */
  frame_count?: number;
  /** Real-world pixel size in mm (0028,0030 PixelSpacing row). 0 / absent = unknown. */
  pixel_spacing?: number;
  /** PhotometricInterpretation (0028,0004): "MONOCHROME1" | "MONOCHROME2" | … */
  photometric?: string;

  // ── Full DICOM panel fields (Plano P) ────────────────────────────────────
  // Patient
  patient_name?: string;
  patient_birth_date?: string;
  patient_sex?: string;
  // Study
  study_description?: string;
  accession_number?: string;
  study_instance_uid?: string;
  // Series
  series_number?: string;
  laterality?: string;
  view_position?: string;
  body_part_examined?: string;
  // Equipment
  manufacturer?: string;
  manufacturer_model?: string;
  institution_name?: string;
  station_name?: string;
  // Acquisition
  kvp?: number;
  exposure_time_ms?: number;
  tube_current_ma?: number;
  exposure_mas?: number;
  compression_force_n?: number;
  imager_pixel_spacing?: number;
  // Image
  bits_allocated?: number;
  rows?: number;
  columns?: number;
}

export interface StudyListItem {
  id: string;
  patient_id: string;
}

export interface AnnotationDTO {
  id?: string;
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  bbox?: { x: number; y: number; w: number; h: number };
  label?: string;
  notes?: string;
  audio_duration_ms?: number;
  audio_transcript?: string;

  // ── Provenance ─────────────────────────────────────────────────────────────
  source?: AnnotationSource;
  model_id?: string;
  ai_confidence?: number;
  ai_kind?: string;
  ai_birads?: string;
  /** Box the model proposed, before any human correction. */
  ai_bbox?: BBox;
}

export interface SaveAnnotationsRequest {
  annotations: AnnotationDTO[];
}

export interface RunInferenceRequest {
  image_path: string;
  study_id?: string;
}

export interface FindingDTO {
  id?: string;
  kind?: string;
  birads?: string;
  confidence?: number;
  bbox?: { x: number; y: number; w: number; h: number };
  notes?: string;
}

export interface RunInferenceResponse {
  task_id: string;
  model_id: string;
  findings: FindingDTO[];
  status: string;
}

export interface WindowingRequest {
  pixels: number[];
  window_center: number;
  window_width: number;
}

export interface WindowingResponse {
  pixels: number[];
}

/** Estado do modelo por trás do serviço de IA.
 *  'real'      pesos carregados — os achados vêm dos modelos
 *  'simulated' o serviço responde, mas do backend mock — achados sintéticos
 *  'none'      serviço fora do ar ou desabilitado */
export type AiModelState = 'real' | 'simulated' | 'none';

export interface HealthStatus {
  status: string;
  error?: string;
  message?: string;
  state?: string;
  /** Set by /readyz: "up" if Go core is reachable. */
  go_core?: string;
  /** Set by /readyz: "ready" | "down" | "disabled" — estado do SERVIÇO. */
  ai_engine?: 'ready' | 'down' | 'disabled';
  /** Set by /readyz: estado do MODELO. Um serviço "ready" pode estar
   *  respondendo do backend mock, com achados sintéticos. */
  ai_model?: AiModelState;
  /** Por que não há modelo real, quando ai_model !== 'real'. */
  ai_model_reason?: string;
  /** Human-readable reason when ai_engine === "disabled". */
  ai_engine_reason?: string;
  /** Set by /healthz: "ok" | "corrupted". */
  db_status?: 'ok' | 'corrupted';
  /** Human-readable detail when db_status === "corrupted". */
  db_error?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Thin HTTP wrapper over the Go Core API (default 127.0.0.1:8088).
 * All endpoints mirror handlers under apps/core/internal/adapters/http/.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private base = 'http://127.0.0.1:8088';

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
        return (body as { error: string }).error;
      }
      if (typeof body === 'string' && body.length) return body;
      return `HTTP ${err.status}`;
    }
    return fallback;
  }

  // ── health ────────────────────────────────────────────────────────────────
  health(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.base}/healthz`).pipe(
      catchError(err => of({ status: 'unreachable', error: String(err?.message ?? err) }))
    );
  }
  ready(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.base}/readyz`).pipe(
      catchError(err => of({ status: 'unreachable', error: String(err?.message ?? err) }))
    );
  }
  startupStatus(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.base}/startup/status`).pipe(
      catchError(err => of({ status: 'unreachable', error: String(err?.message ?? err) }))
    );
  }

  // ── studies ───────────────────────────────────────────────────────────────
  listStudies(): Observable<StudyListItem[]> {
    return this.http.get<StudyListItem[]>(`${this.base}/api/studies`).pipe(
      catchError(() => of([] as StudyListItem[]))
    );
  }
  openStudy(filePath: string): Observable<OpenStudyResponse | null> {
    return this.http.post<OpenStudyResponse>(`${this.base}/api/studies`, {
      file_path: filePath
    } as OpenStudyRequest).pipe(
      catchError(err => {
        const msg = this.extractError(err, 'Falha ao abrir imagem');
        console.error('[openStudy]', filePath, err);
        this.toast.show(`Não foi possível abrir: ${msg}`, 'error');
        return of(null);
      })
    );
  }
  getStudy(id: string): Observable<(OpenStudyResponse & ClinicalFields) | null> {
    return this.http.get<OpenStudyResponse & ClinicalFields>(`${this.base}/api/studies/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  // ── annotations ───────────────────────────────────────────────────────────
  /**
   * Persists the radiologist's marks plus the suggestions they discarded.
   *
   * Rejections are sent as annotations of their own: a false positive is worth
   * as much for retraining as a correction, and it exists nowhere else once the
   * viewport is cleared. They carry the model's box and no human geometry.
   */
  saveAnnotations(studyId: string, rois: ROI[], rejected: AiFinding[] = []): Observable<boolean> {
    const annotations: AnnotationDTO[] = rois.map(r => ({
      ...(r.annotationId ? { id: r.annotationId } : {}),
      kind: r.shape === 'rect' ? 'rect' : 'ellipse',
      x: r.x - r.rx,
      y: r.y - r.ry,
      w: r.rx * 2,
      h: r.ry * 2,
      ...(r.label ? { label: r.label } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      // A ROI accepted from the model and then moved is an edit, not a plain
      // acceptance — the difference is the whole point of keeping ai_bbox.
      ...(r.source ? { source: geometryDiffers(r) ? 'ai_edited' as const : r.source } : {}),
      ...(r.modelId ? { model_id: r.modelId } : {}),
      ...(r.aiConfidence != null ? { ai_confidence: r.aiConfidence } : {}),
      ...(r.aiKind ? { ai_kind: r.aiKind } : {}),
      ...(r.aiBirads ? { ai_birads: r.aiBirads } : {}),
      ...(r.aiBbox ? { ai_bbox: r.aiBbox } : {}),
    }));

    for (const f of rejected) {
      if (!f.bbox) continue;
      annotations.push({
        id: f.id,
        kind: 'rect',
        // No human geometry: the radiologist asserted nothing here.
        x: 0, y: 0, w: 0, h: 0,
        source: 'ai_rejected',
        model_id: f.modelId,
        ai_confidence: f.confidence,
        ai_kind: f.kind,
        ai_birads: f.birads,
        ai_bbox: f.bbox,
      });
    }
    return this.http.post(`${this.base}/api/studies/${studyId}/annotations`, {
      annotations
    } as SaveAnnotationsRequest).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }
  getAnnotations(studyId: string): Observable<{ annotations: AnnotationDTO[]; count: number }> {
    return this.http.get<{ annotations: AnnotationDTO[]; count: number }>(
      `${this.base}/api/studies/${studyId}/annotations`
    ).pipe(catchError(() => of({ annotations: [], count: 0 })));
  }

  // ── inference ─────────────────────────────────────────────────────────────
  runInference(imagePath: string, studyId?: string): Observable<RunInferenceResponse | null> {
    return this.http.post<RunInferenceResponse>(`${this.base}/api/tasks/predict`, {
      image_path: imagePath,
      study_id: studyId
    } as RunInferenceRequest).pipe(catchError(() => of(null)));
  }

  // ── export ────────────────────────────────────────────────────────────────
  /** Triggers a download of JSON or CSV export via the browser. */
  downloadExport(format: 'json' | 'csv' | 'coco', studyIds?: string[]) {
    const ids = studyIds?.length ? `&study_ids=${studyIds.join(',')}` : '';
    const url = `${this.base}/api/export?format=${format}${ids}`;
    const a = document.createElement('a');
    a.href = url; a.download = ''; a.click();
  }

  /**
   * Exporta o laudo em PDF.
   *
   * No aplicativo (Wails), abre o diálogo nativo de destino e grava onde o
   * usuário escolher. Um `<a download>` na WebView não pergunta o destino e
   * ainda abre o PDF dentro da janela do aplicativo, sem barra de navegação —
   * o usuário fica sem voltar nem fechar.
   *
   * No navegador não há diálogo nativo; mantém-se o download convencional.
   *
   * Devolve o caminho gravado, '' se cancelado, ou 'erro: …'.
   */
  async saveReportPDF(studyId: string, sugestao: string): Promise<string> {
    const wails = (window as any).go?.main?.App;
    if (wails?.SaveReportPDF) {
      return await wails.SaveReportPDF(studyId, sugestao);
    }
    const a = document.createElement('a');
    a.href = `${this.base}/api/studies/${studyId}/pdf`;
    a.download = sugestao;
    a.click();
    return 'download';
  }

  /** Revela o arquivo no Finder (apenas no aplicativo). */
  revealInFinder(path: string) {
    (window as any).go?.main?.App?.RevealInFinder?.(path);
  }

  /**
   * Opens the printable HTML report in a new window.
   * The page auto-triggers window.print() so the user can save as PDF
   * from the browser's print dialog (supports colours and page margins).
   */
  openReportHTML(studyId: string) {
    window.open(`${this.base}/api/export/report/${studyId}`, 'mammo-report');
  }

  /** Updates the clinical report fields on a study (BI-RADS, conclusion, …). */
  patchClinical(studyId: string, fields: {
    birads_global?: string;
    birads_density?: string;
    conclusion?: string;
    recommendation?: string;
    signed_by?: string;
    signed_at?: string;
  }): Observable<boolean> {
    return this.http.patch(`${this.base}/api/studies/${studyId}/clinical`, fields).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /** Direct URL of the annotated DICOM preview (PNG with ROIs overlaid). */
  annotatedPreviewURL(studyId: string): string {
    return `${this.base}/api/studies/${studyId}/preview/annotated`;
  }

  /** Triggers a download of the annotated PNG as a standalone file. */
  downloadAnnotatedPNG(studyId: string) {
    const a = document.createElement('a');
    a.href = this.annotatedPreviewURL(studyId);
    a.download = `aidentify-marked-${studyId.slice(0, 8)}.png`;
    a.click();
  }

  /** Triggers a download of the SQLite database snapshot. */
  downloadBackup() {
    const a = document.createElement('a');
    a.href = `${this.base}/api/backup`;
    a.download = '';
    a.click();
  }

  /**
   * Uploads a backup ZIP for restore.
   * The server stages the DB and responds with { status: 'pending_restart', message }.
   * The app must be restarted for the DB swap to take effect.
   */
  restoreBackup(file: File): Observable<{ status: string; message: string } | null> {
    const fd = new FormData();
    fd.append('backup', file);
    return this.http.post<{ status: string; message: string }>(
      `${this.base}/api/restore`, fd
    ).pipe(catchError(() => of(null)));
  }

  // ── patients ──────────────────────────────────────────────────────────────
  listPatients(query?: string, limit = 50): Observable<PatientDTO[]> {
    const q = query ? `?q=${encodeURIComponent(query)}&limit=${limit}` : `?limit=${limit}`;
    return this.http.get<PatientDTO[]>(`${this.base}/api/patients${q}`).pipe(
      catchError(() => of([] as PatientDTO[]))
    );
  }
  getPatient(id: string): Observable<PatientDTO | null> {
    return this.http.get<PatientDTO>(`${this.base}/api/patients/${id}`).pipe(
      catchError(() => of(null))
    );
  }
  createPatient(p: Partial<PatientDTO>): Observable<PatientDTO | null> {
    return this.http.post<PatientDTO>(`${this.base}/api/patients`, p).pipe(
      catchError(() => of(null))
    );
  }
  patchPatient(id: string, p: Partial<PatientDTO>): Observable<PatientDTO | null> {
    return this.http.patch<PatientDTO>(`${this.base}/api/patients/${id}`, p).pipe(
      catchError(() => of(null))
    );
  }
  listPatientStudies(id: string): Observable<PatientStudyDTO[]> {
    return this.http.get<PatientStudyDTO[]>(`${this.base}/api/patients/${id}/studies`).pipe(
      catchError(() => of([] as PatientStudyDTO[]))
    );
  }
  assignStudyToPatient(studyId: string, patientUUID: string): Observable<boolean> {
    return this.http.patch(`${this.base}/api/studies/${studyId}/patient`, { patient_uuid: patientUUID }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  /** Lists directory entries via GET /api/fs/list?path=<dir>. */
  listDirectory(path: string): Observable<{ path: string; entries: { name: string; type: string; size: number; mtime: string; ext?: string }[] } | null> {
    const q = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.http.get<{ path: string; entries: { name: string; type: string; size: number; mtime: string; ext?: string }[] }>(
      `${this.base}/api/fs/list${q}`
    ).pipe(catchError(() => of(null)));
  }

  /** URL of the rendered DICOM preview (PNG with WW/WC applied server-side). */
  previewURL(studyId: string, ww?: number, wc?: number, frame?: number): string {
    const q: string[] = [];
    if (ww) q.push(`ww=${ww}`);
    if (wc) q.push(`wc=${wc}`);
    if (frame && frame > 0) q.push(`frame=${frame}`);
    const qs = q.length ? `?${q.join('&')}` : '';
    return `${this.base}/api/studies/${studyId}/preview${qs}`;
  }

  // ── audio annotations ─────────────────────────────────────────────────────
  /** Upload raw WebM audio blob for an annotation. Returns duration_ms on success. */
  uploadAnnotationAudio(
    annotId: string,
    blob: Blob,
    durationMs: number,
    transcript?: string,
  ): Observable<{ audio_duration_ms: number } | null> {
    const params = new URLSearchParams({ duration_ms: String(durationMs) });
    if (transcript) params.set('transcript', transcript);
    return this.http.post<{ audio_duration_ms: number }>(
      `${this.base}/api/annotations/${annotId}/audio?${params}`,
      blob,
      { headers: { 'Content-Type': 'audio/webm' } }
    ).pipe(catchError(() => of(null)));
  }

  annotationAudioURL(annotId: string): string {
    return `${this.base}/api/annotations/${annotId}/audio`;
  }

  deleteAnnotationAudio(annotId: string): Observable<boolean> {
    return this.http.delete(`${this.base}/api/annotations/${annotId}/audio`).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // ── windowing ─────────────────────────────────────────────────────────────
  applyWindowing(req: WindowingRequest): Observable<WindowingResponse | null> {
    return this.http.post<WindowingResponse>(`${this.base}/api/pdi/windowing`, req).pipe(
      catchError(() => of(null))
    );
  }
}
