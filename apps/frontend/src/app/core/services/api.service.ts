import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ROI } from '../../shared/models/types';

// ─── DTOs (mirror Go DTOs in apps/core/internal/application/usecase) ──────────

export interface OpenStudyRequest {
  file_path: string;
}

export interface ClinicalFields {
  birads_global?: string;
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
  audio_duration_ms?: number;
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

export interface HealthStatus {
  status: string;
  error?: string;
  message?: string;
  state?: string;
  /** Set by /readyz: "up" if Go core is reachable. */
  go_core?: string;
  /** Set by /readyz: "ready" | "down" | "disabled". */
  ai_engine?: 'ready' | 'down' | 'disabled';
  /** Human-readable reason when ai_engine === "disabled". */
  ai_engine_reason?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Thin HTTP wrapper over the Go Core API (default 127.0.0.1:8088).
 * All endpoints mirror handlers under apps/core/internal/adapters/http/.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = 'http://127.0.0.1:8088';

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
    } as OpenStudyRequest).pipe(catchError(() => of(null)));
  }
  getStudy(id: string): Observable<(OpenStudyResponse & ClinicalFields) | null> {
    return this.http.get<OpenStudyResponse & ClinicalFields>(`${this.base}/api/studies/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  // ── annotations ───────────────────────────────────────────────────────────
  saveAnnotations(studyId: string, rois: ROI[]): Observable<boolean> {
    const annotations: AnnotationDTO[] = rois.map(r => ({
      ...(r.annotationId ? { id: r.annotationId } : {}),
      kind: r.shape === 'rect' ? 'rect' : 'ellipse',
      x: r.x - r.rx,
      y: r.y - r.ry,
      w: r.rx * 2,
      h: r.ry * 2
    }));
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
  downloadExport(format: 'json' | 'csv', studyIds?: string[]) {
    const ids = studyIds?.length ? `&study_ids=${studyIds.join(',')}` : '';
    const url = `${this.base}/api/export?format=${format}${ids}`;
    const a = document.createElement('a');
    a.href = url; a.download = ''; a.click();
  }

  /** Opens the HTML report in a new window for PDF printing. */
  openReport(studyId: string) {
    window.open(`${this.base}/api/export/report/${studyId}`, 'mammo-report');
  }

  /** Updates the clinical report fields on a study (BI-RADS, conclusion, …). */
  patchClinical(studyId: string, fields: {
    birads_global?: string;
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
  uploadAnnotationAudio(annotId: string, blob: Blob, durationMs: number): Observable<{ audio_duration_ms: number } | null> {
    return this.http.post<{ audio_duration_ms: number }>(
      `${this.base}/api/annotations/${annotId}/audio?duration_ms=${durationMs}`,
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
