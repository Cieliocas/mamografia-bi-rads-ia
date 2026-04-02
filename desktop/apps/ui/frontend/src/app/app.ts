import {
  Component, ElementRef, OnInit, OnDestroy, ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, FolderOpen, History, BarChart3, Wrench,
  HelpCircle, Plus, ZoomIn, ZoomOut, Hand, Edit3, Ruler, Grid3X3,
  Maximize2, ChevronRight, AlertTriangle, MapPin, Sparkles, Settings,
  User, Keyboard, RotateCw, Circle, Square, Activity, Upload, X, Move
} from 'lucide-angular';

interface Marker {
  x: number;
  y: number;
  label: string;
  type: 'mass' | 'calcification' | 'custom';
  id: number;
}

interface Measurement {
  x1: number; y1: number;
  x2: number; y2: number;
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, OnDestroy {
  // Splash
  showSplash = true;
  progress = 0;

  // Image state
  loadedImage: HTMLImageElement | null = null;
  imageDataUrl: string | null = null;
  imageName = '';

  // Viewport state
  zoom = 1;
  panX = 0;
  panY = 0;
  contrast = 80;
  brightness = 100;
  isDragging = false;
  dragStart = { x: 0, y: 0 };
  lastPan = { x: 0, y: 0 };

  // Tool state
  activeTool: 'pan' | 'zoom' | 'ruler' | 'marker' | 'annotate' = 'pan';

  // Overlay data
  markers: Marker[] = [];
  measurements: Measurement[] = [];
  isDrawingMeasure = false;
  measureStart: { x: number; y: number } | null = null;
  tempMeasure: Measurement | null = null;
  markerIdCounter = 1;

  // Active exam
  activeExam = 'EXAM_CC_LEFT_0921';

  // Panel navigation
  activePanel: 'images' | 'history' | 'analysis' | 'tools' = 'images';

  // History of loaded files
  historyFiles: { name: string; dataUrl: string; date: string }[] = [];

  // Patient info toggle
  showPatientInfo = true;

  // Icon registry
  readonly icons = {
    FolderOpen, History, BarChart3, Wrench, HelpCircle, Plus,
    ZoomIn, ZoomOut, Hand, Edit3, Ruler, Grid3X3, Maximize2,
    ChevronRight, AlertTriangle, MapPin, Sparkles, Settings,
    User, Keyboard, RotateCw, Circle, Square, Activity, Upload, X, Move
  };

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('viewerContainer') viewerContainer!: ElementRef<HTMLDivElement>;

  private animFrame: number | null = null;

  ngOnInit(): void {
    const timer = setInterval(() => {
      this.progress += 2;
      if (this.progress >= 100) {
        clearInterval(timer);
        this.progress = 100;
        setTimeout(() => { this.showSplash = false; }, 500);
      }
    }, 30);
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  // ─── File Loading ────────────────────────────────────────────
  openFileDialog(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.imageName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      this.imageDataUrl = result;
      const img = new Image();
      img.onload = () => {
        this.loadedImage = img;
        this.resetViewport();
        this.clearOverlays();
        this.drawCanvas();
        // Add to history
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
    input.value = '';
  }

  setPanel(panel: 'images' | 'history' | 'analysis' | 'tools'): void {
    this.activePanel = panel;
  }

  loadFromHistory(item: { name: string; dataUrl: string; date: string }): void {
    this.imageName = item.name;
    this.imageDataUrl = item.dataUrl;
    const img = new Image();
    img.onload = () => {
      this.loadedImage = img;
      this.resetViewport();
      this.clearOverlays();
      this.drawCanvas();
    };
    img.src = item.dataUrl;
    this.activePanel = 'images';
  }

  // ─── Canvas Rendering ─────────────────────────────────────────
  drawCanvas(): void {
    const canvas = this.canvasEl?.nativeElement;
    if (!canvas || !this.loadedImage) return;
    const ctx = canvas.getContext('2d')!;
    const container = this.viewerContainer.nativeElement;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply contrast / brightness filter
    ctx.filter = `contrast(${this.contrast}%) brightness(${this.brightness}%)`;

    // Center + pan + zoom
    const cx = canvas.width / 2 + this.panX;
    const cy = canvas.height / 2 + this.panY;
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);

    const iw = this.loadedImage.naturalWidth;
    const ih = this.loadedImage.naturalHeight;
    ctx.drawImage(this.loadedImage, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    // Draw markers (unfiltered, in screen space)
    this.drawMarkers(ctx, canvas.width, canvas.height);
    this.drawMeasurements(ctx, canvas.width, canvas.height);
  }

  drawMarkers(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
    const cx = cw / 2 + this.panX;
    const cy = ch / 2 + this.panY;
    const img = this.loadedImage!;

    ctx.save();
    this.markers.forEach(m => {
      // Convert image coords → screen coords
      const sx = cx + (m.x - img.naturalWidth / 2) * this.zoom;
      const sy = cy + (m.y - img.naturalHeight / 2) * this.zoom;
      const r = 18 * this.zoom;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = m.type === 'mass' ? '#ff6e84' : '#00e3fd';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing fill
      ctx.fillStyle = m.type === 'mass' ? 'rgba(255,110,132,0.15)' : 'rgba(0,227,253,0.15)';
      ctx.fill();

      // Label above
      ctx.fillStyle = m.type === 'mass' ? '#ff6e84' : '#00e3fd';
      ctx.font = `bold ${Math.max(10, 11 * this.zoom)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(m.label, sx, sy - r - 4);
    });
    ctx.restore();
  }

  drawMeasurements(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
    const cx = cw / 2 + this.panX;
    const cy = ch / 2 + this.panY;
    const img = this.loadedImage!;

    const toScreen = (ix: number, iy: number) => ({
      x: cx + (ix - img.naturalWidth / 2) * this.zoom,
      y: cy + (iy - img.naturalHeight / 2) * this.zoom
    });

    ctx.save();
    const all = [...this.measurements, ...(this.tempMeasure ? [this.tempMeasure] : [])];
    all.forEach(meas => {
      const a = toScreen(meas.x1, meas.y1);
      const b = toScreen(meas.x2, meas.y2);
      const dist = Math.sqrt((meas.x2 - meas.x1) ** 2 + (meas.y2 - meas.y1) ** 2).toFixed(1);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#afa2ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Endpoints
      [a, b].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#afa2ff';
        ctx.fill();
      });

      // Distance label
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 8;
      ctx.fillStyle = '#afa2ff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${dist}px`, mx, my);
    });
    ctx.restore();
  }

  // ─── Viewport Controls ────────────────────────────────────────
  resetViewport(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.contrast = 80;
    this.brightness = 100;
    if (this.loadedImage && this.canvasEl) {
      const canvas = this.canvasEl.nativeElement;
      const container = this.viewerContainer.nativeElement;
      const scaleW = container.clientWidth / this.loadedImage.naturalWidth;
      const scaleH = container.clientHeight / this.loadedImage.naturalHeight;
      this.zoom = Math.min(scaleW, scaleH) * 0.9;
    }
  }

  zoomIn(): void {
    this.zoom = Math.min(this.zoom * 1.2, 10);
    this.drawCanvas();
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom / 1.2, 0.05);
    this.drawCanvas();
  }

  fitToScreen(): void {
    this.resetViewport();
    this.drawCanvas();
  }

  setActiveTool(tool: 'pan' | 'zoom' | 'ruler' | 'marker' | 'annotate'): void {
    this.activeTool = tool;
    this.isDrawingMeasure = false;
    this.tempMeasure = null;
  }

  clearOverlays(): void {
    this.markers = [];
    this.measurements = [];
    this.tempMeasure = null;
  }

  // ─── Mouse Events ─────────────────────────────────────────────
  onMouseDown(event: MouseEvent): void {
    if (!this.loadedImage) return;
    event.preventDefault();

    const pos = this.screenToImage(event);

    if (this.activeTool === 'pan') {
      this.isDragging = true;
      this.dragStart = { x: event.clientX - this.panX, y: event.clientY - this.panY };
    } else if (this.activeTool === 'zoom') {
      if (event.button === 0) this.zoomIn();
      else this.zoomOut();
    } else if (this.activeTool === 'ruler') {
      this.isDrawingMeasure = true;
      this.measureStart = pos;
      this.tempMeasure = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, label: '' };
    } else if (this.activeTool === 'marker') {
      const label = this.markers.length === 0 ? 'MASS' : 'FINDING';
      const type = this.markers.length === 0 ? 'mass' : 'calcification';
      this.markers.push({ x: pos.x, y: pos.y, label, type, id: this.markerIdCounter++ });
      this.drawCanvas();
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.loadedImage) return;

    if (this.activeTool === 'pan' && this.isDragging) {
      this.panX = event.clientX - this.dragStart.x;
      this.panY = event.clientY - this.dragStart.y;
      this.drawCanvas();
    } else if (this.activeTool === 'ruler' && this.isDrawingMeasure && this.tempMeasure) {
      const pos = this.screenToImage(event);
      this.tempMeasure.x2 = pos.x;
      this.tempMeasure.y2 = pos.y;
      this.drawCanvas();
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (this.activeTool === 'pan') {
      this.isDragging = false;
    } else if (this.activeTool === 'ruler' && this.isDrawingMeasure && this.tempMeasure) {
      const pos = this.screenToImage(event);
      this.tempMeasure.x2 = pos.x;
      this.tempMeasure.y2 = pos.y;
      this.measurements.push({ ...this.tempMeasure });
      this.tempMeasure = null;
      this.isDrawingMeasure = false;
      this.drawCanvas();
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!this.loadedImage) return;
    const target = event.target as HTMLElement;
    if (!target.closest('#viewer-canvas-container')) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.min(Math.max(this.zoom * delta, 0.05), 10);
    this.drawCanvas();
  }

  // Converts screen coords → image coords
  screenToImage(event: MouseEvent): { x: number; y: number } {
    const canvas = this.canvasEl.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const cx = canvas.width / 2 + this.panX;
    const cy = canvas.height / 2 + this.panY;
    const img = this.loadedImage!;
    return {
      x: (sx - cx) / this.zoom + img.naturalWidth / 2,
      y: (sy - cy) / this.zoom + img.naturalHeight / 2
    };
  }

  onContrastChange(): void {
    this.drawCanvas();
  }

  // ─── Computed Getters ─────────────────────────────────────────
  get zoomPercent(): string {
    return Math.round(this.zoom * 100) + '%';
  }

  get cursorClass(): string {
    if (!this.loadedImage) return 'cursor-default';
    if (this.activeTool === 'pan') return this.isDragging ? 'cursor-grabbing' : 'cursor-grab';
    if (this.activeTool === 'zoom') return 'cursor-zoom-in';
    if (this.activeTool === 'ruler') return 'cursor-crosshair';
    if (this.activeTool === 'marker') return 'cursor-crosshair';
    return 'cursor-default';
  }

  get markersSorted(): Marker[] {
    return this.markers.slice().sort((a, b) => a.id - b.id);
  }

  padNum(n: number, len = 2): string {
    return String(n).padStart(len, '0');
  }
}
