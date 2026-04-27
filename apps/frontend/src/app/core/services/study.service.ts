import { Injectable } from '@angular/core';
import { VP } from '../../shared/models/types';

export interface HistoryEntry {
  name: string;
  dataUrl: string;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class StudyService {

  historyFiles: HistoryEntry[] = [];

  /**
   * Loads a File into the given VP and pushes it to historyFiles.
   * Calls onLoaded(vpIdx) when the image is ready to draw.
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
        this.historyFiles.unshift({
          name: file.name,
          dataUrl: result,
          date: new Date().toLocaleString('pt-BR')
        });
        if (this.historyFiles.length > 20) this.historyFiles.pop();
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
    };
    img.src = entry.dataUrl;
  }
}
