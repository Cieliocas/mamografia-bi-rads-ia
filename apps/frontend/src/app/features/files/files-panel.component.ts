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
  /** Set by the Go Core: openable by the viewer, by extension or DICM magic. */
  is_image?: boolean;
}

const IMAGE_EXTS = new Set(['.dcm', '.dicom', '.png', '.jpg', '.jpeg']);

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

  /**
   * Raiz do $HOME, descoberta na primeira listagem sem caminho.
   *
   * O Go Core recusa qualquer caminho fora do $HOME (403), então a navegação
   * para cima precisa parar aí — oferecer um nível acima que o backend vai
   * rejeitar seria um beco sem saída.
   */
  private homePath = signal<string>('');

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
    if (e.type !== 'file') return false;
    // The Go Core sniffs the DICM magic for extensionless files — CD exports and
    // PACS dumps name mammograms like "<incidência>", with no extension at all.
    // Extension stays as the fallback for older cores that omit the flag.
    return e.is_image ?? IMAGE_EXTS.has((e.ext ?? '').toLowerCase());
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

  /** Segmentos clicáveis do caminho atual, do $HOME até a pasta corrente. */
  readonly breadcrumb = computed<{ nome: string; caminho: string }[]>(() => {
    const home = this.homePath();
    const atual = this.currentPath();
    if (!home || !atual.startsWith(home)) return [];

    const resto = atual.slice(home.length).split('/').filter(Boolean);
    const trilha = [{ nome: '~', caminho: home }];
    let acc = home;
    for (const seg of resto) {
      acc = `${acc}/${seg}`;
      trilha.push({ nome: seg, caminho: acc });
    }
    return trilha;
  });

  /** Diretório-pai, ou '' quando já estamos na raiz permitida. */
  readonly parentPath = computed<string>(() => {
    const home = this.homePath();
    const atual = this.currentPath();
    if (!home || !atual || atual === home || !atual.startsWith(home)) return '';
    const pai = atual.slice(0, atual.lastIndexOf('/'));
    return pai.length >= home.length ? pai : home;
  });

  goUp() {
    const pai = this.parentPath();
    if (pai) this.navigate(pai);
  }

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
        // A primeira listagem sem caminho devolve o $HOME resolvido pelo backend:
        // é a única fonte confiável do limite de navegação.
        if (!path && !this.homePath()) this.homePath.set(data.path);
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
    // Descobre o $HOME sempre, mesmo restaurando uma pasta profunda — sem isso
    // a trilha e o botão de subir ficariam indisponíveis justamente no caso em
    // que são mais necessários.
    if (!this.homePath()) {
      fetch('http://127.0.0.1:8088/api/fs/list')
        .then(r => r.json())
        .then((d: { path: string }) => this.homePath.set(d.path))
        .catch(() => { /* a trilha simplesmente não aparece */ });
    }
    if (saved) {
      this.navigate(saved, false);
    } else {
      this.load('');
    }
  }

  /** Volta à raiz do $HOME. */
  goHome() {
    const home = this.homePath();
    if (home) this.navigate(home);
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
