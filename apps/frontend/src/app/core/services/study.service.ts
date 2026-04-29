import { Injectable, inject, signal } from '@angular/core';
import { VP } from '../../shared/models/types';
import { ApiService, FindingDTO } from './api.service';

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

  /** Active study returned from POST /api/studies (null while running offline). */
  currentStudyId = signal<string | null>(null);
  /** Last filesystem path opened (used by inference / windowing endpoints). */
  currentFilePath = signal<string | null>(null);
  /** Latest inference response, exposed for the findings panel. */
  latestFindings = signal<FindingDTO[]>([]);
  /** Backend connectivity state, surfaced in the status bar. */
  backendOnline = signal<boolean>(false);

  constructor() {
    this.api.health().subscribe(s => this.backendOnline.set(s.status === 'go-core-up'));
  }

  /**
   * Loads a File into the given VP and pushes it to historyFiles.
   * Calls onLoaded(vpIdx) when the image is ready to draw.
   * Also tries to register the study in the Go Core (silently no-ops if backend offline).
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

        const entry: HistoryEntry = {
          name: file.name,
          dataUrl: result,
          date: new Date().toLocaleString('pt-BR'),
          filePath: fakePath
        };
        this.historyFiles.unshift(entry);
        if (this.historyFiles.length > 20) this.historyFiles.pop();

        // Best-effort: register the study in the backend.
        this.api.openStudy(fakePath).subscribe(resp => {
          if (resp?.id) {
            this.currentStudyId.set(resp.id);
            entry.studyId = resp.id;
          }
        });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Re-loads a history entry into the given VP.
   * Calls onLoaded(vpIdx) when the image is ready to draw.
   */
  loadHistoryEntry(entry: HistoryEntry, vpIdx: number, vp: VP, onLoaded: (vpIdx: number) => void) {
    vp.imageName = entry.name;
    vp.imageDataUrl = entry.dataUrl;
    const img = new Image();
    img.onload = () => {
      vp.loadedImage = img;
      onLoaded(vpIdx);
      if (entry.studyId) this.currentStudyId.set(entry.studyId);
      if (entry.filePath) this.currentFilePath.set(entry.filePath);
    };
    img.src = entry.dataUrl;
  }

  /** Triggers POST /api/tasks/predict and stores the findings on success. */
  runInference() {
    const path = this.currentFilePath();
    if (!path) return;
    const studyId = this.currentStudyId() ?? undefined;
    this.api.runInference(path, studyId).subscribe(resp => {
      this.latestFindings.set(resp?.findings ?? []);
    });
  }

  /** Persists current ROIs as annotations on the active study. */
  saveAnnotations(rois: VP['rois']) {
    const studyId = this.currentStudyId();
    if (!studyId) return;
    this.api.saveAnnotations(studyId, rois).subscribe();
  }
}
