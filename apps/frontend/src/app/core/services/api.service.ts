import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ROI } from '../../shared/models/types';

// ─── DTOs (mirror Go DTOs in apps/core/internal/application/usecase) ──────────

export interface OpenStudyRequest {
  file_path: string;
}

export interface OpenStudyResponse {
  id: string;
  patient_id: string;
  study_date: string;
}

export interface StudyListItem {
  id: string;
  patient_id: string;
}

export interface AnnotationDTO {
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
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
  getStudy(id: string): Observable<OpenStudyResponse | null> {
    return this.http.get<OpenStudyResponse>(`${this.base}/api/studies/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  // ── annotations ───────────────────────────────────────────────────────────
  saveAnnotations(studyId: string, rois: ROI[]): Observable<boolean> {
    const annotations: AnnotationDTO[] = rois.map(r => ({
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

  // ── windowing ─────────────────────────────────────────────────────────────
  applyWindowing(req: WindowingRequest): Observable<WindowingResponse | null> {
    return this.http.post<WindowingResponse>(`${this.base}/api/pdi/windowing`, req).pipe(
      catchError(() => of(null))
    );
  }
}
