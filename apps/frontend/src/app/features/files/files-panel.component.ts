import {
  Component, inject, Output, EventEmitter, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Folder, FolderOpen, FileImage, File,
  ChevronRight, ChevronDown, RefreshCw, Search, Home
} from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';

export interface FsEntry {
  name: string;
  type: 'dir' | 'file';
  size: number;
  mtime: string;
  ext?: string;
}

const IMAGE_EXTS = new Set(['.dcm', '.png', '.jpg', '.jpeg']);

@Component({
  selector: 'app-files-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './files-panel.component.html',
  // The host element sits inside a flex column; these classes make it fill the
  // available height so the inner overflow-y-auto scroll actually works.
  host: { class: 'flex flex-col flex-1 min-h-0 overflow-hidden' },
})
export class FilesPanelComponent {
  private api = inject(ApiService);

  readonly icons = { Folder, FolderOpen, FileImage, File, ChevronRight, ChevronDown, RefreshCw, Search, Home };

  /** Path currently being listed. */
  currentPath = signal<string>('');
  entries     = signal<FsEntry[]>([]);
  loading     = signal(false);
  error       = signal('');
  filter      = signal('');

  /** History stack for ← navigation. */
  private history: string[] = [];

  @Output() openFile      = new EventEmitter<string>();
  @Output() pickFolder    = new EventEmitter<void>();   // triggers Wails dialog
  /** Emitted when an image file is clicked; carries the full ordered series. */
  @Output() openSeries    = new EventEmitter<{ path: string; files: string[]; index: number }>();

  filtered = computed(() => {
    const q = this.filter().toLowerCase();
    if (!q) return this.entries();
    return this.entries().filter(e => e.name.toLowerCase().includes(q));
  });

  isImage(e: FsEntry): boolean {
    return e.type === 'file' && IMAGE_EXTS.has((e.ext ?? '').toLowerCase());
  }

  /** Load a directory, pushing current to history stack. */
  navigate(path: string, pushHistory = true) {
    if (pushHistory && this.currentPath()) {
      this.history.push(this.currentPath());
    }
    this.currentPath.set(path);
    this.filter.set('');
    this.load(path);
    localStorage.setItem('aidentify.lastFolder', path);
  }

  back() {
    const prev = this.history.pop();
    if (prev) this.navigate(prev, false);
  }

  refresh() { this.load(this.currentPath()); }

  /** Called by app.ts when user picks a folder via Wails dialog. */
  setRoot(path: string) {
    this.history = [];
    this.navigate(path, false);
  }

  private load(path: string) {
    this.loading.set(true);
    this.error.set('');
    const url = path
      ? `http://127.0.0.1:8088/api/fs/list?path=${encodeURIComponent(path)}`
      : `http://127.0.0.1:8088/api/fs/list`;
    fetch(url)
      .then(r => r.json())
      .then((data: { path: string; entries: FsEntry[] }) => {
        this.currentPath.set(data.path);
        this.entries.set(data.entries ?? []);
        this.loading.set(false);
      })
      .catch(err => {
        this.error.set(String(err));
        this.loading.set(false);
      });
  }

  /** Restore last folder from localStorage on first open. */
  init() {
    const saved = localStorage.getItem('aidentify.lastFolder');
    if (saved) {
      this.navigate(saved, false);
    } else {
      this.load(''); // loads $HOME
    }
  }

  /**
   * Called when the user clicks an image file.
   * Emits both `openFile` (backward-compat) and `openSeries` (with full list).
   */
  openImageFile(entry: FsEntry) {
    const path = `${this.currentPath()}/${entry.name}`;
    const imageFiles = this.filtered()
      .filter(e => this.isImage(e))
      .map(e => `${this.currentPath()}/${e.name}`);
    const index = imageFiles.indexOf(path);
    this.openFile.emit(path);
    this.openSeries.emit({ path, files: imageFiles, index });
  }

  /** Friendly display of the current path (last 2 segments). */
  get shortPath(): string {
    const p = this.currentPath();
    if (!p) return '~';
    const parts = p.split('/').filter(Boolean);
    if (parts.length <= 2) return p;
    return '…/' + parts.slice(-2).join('/');
  }

  get canGoBack(): boolean { return this.history.length > 0; }

  formatSize(bytes: number): string {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
