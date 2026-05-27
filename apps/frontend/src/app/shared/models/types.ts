// ─── Domain types ─────────────────────────────────────────────────────────────

export type BiRads = '1'|'2'|'3'|'4A'|'4B'|'4C'|'5'|'6'|null;

export interface ROI {
  id: number; x: number; y: number;
  rx: number; ry: number;
  shape: 'ellipse'|'rect';
  birads: BiRads; label: string; notes: string;
  isSelected: boolean;
  /** UUID assigned by the backend; present after the first save/load. */
  annotationId?: string;
  /** Duration of attached voice note in milliseconds. */
  audioDurationMs?: number;
}

export interface RulerLine {
  id: number; x1: number; y1: number; x2: number; y2: number;
  isSelected: boolean;
  /** When true, renders as an arrow instead of a plain ruler. */
  isArrow?: boolean;
}

/** A single freehand brush mark (sequence of image-space points). */
export interface BrushStroke {
  id: number;
  points: { x: number; y: number }[];
  color: string;
}

export interface Snapshot { rois: ROI[]; rulers: RulerLine[]; brushStrokes: BrushStroke[]; }

/** Viewport — one imaging slot (up to 4 in grid mode). */
export interface VP {
  loadedImage: HTMLImageElement|null;
  imageDataUrl: string|null;
  imageName: string;
  zoom: number; panX: number; panY: number;
  /** CSS brightness (%) — 100 = neutral. Used for the image CSS filter. */
  contrast: number; brightness: number;
  invertColors: boolean;
  rois: ROI[]; rulers: RulerLine[]; brushStrokes: BrushStroke[];
  selectedROIId: number|null;
  roiCounter: number; rulerCounter: number; brushCounter: number;
  undoStack: Snapshot[]; redoStack: Snapshot[];
  /** Active windowing preset label (null = custom / manual). */
  activePreset: string | null;
  /**
   * DICOM pixel spacing in mm/px (tag 0028,0030 row value).
   * When set (non-null, > 0), ruler measurements are displayed in mm.
   * Null means the image has no spatial calibration — distances are in px.
   */
  pixelSpacing: number | null;
}

/** Named windowing preset for mammography display. */
export interface WindowPreset {
  label: string;
  /** CSS brightness % */
  brightness: number;
  /** CSS contrast % */
  contrast: number;
}

export const MAMMOGRAPHY_PRESETS: WindowPreset[] = [
  { label: 'Padrão',        brightness: 100, contrast:  80 },
  { label: 'Tecido mole',   brightness:  80, contrast: 160 },
  { label: 'Microcalc.',    brightness:  60, contrast: 280 },
  { label: 'Alta exposição', brightness: 140, contrast:  55 },
];

export type IxMode =
  'pan'|'draw-roi'|'draw-ruler'|'draw-arrow'|'draw-brush'|
  'move-roi'|'move-ruler-full'|'move-ruler-start'|'move-ruler-end'|
  'move-arrow-full'|'move-arrow-start'|'move-arrow-end'|
  'erase-roi'|'erase-ruler';

/** Active mouse interaction context. */
export interface Ix {
  vpIdx: number; mode: IxMode;
  imgX0: number; imgY0: number;
  clientX0: number; clientY0: number;
  panX0: number; panY0: number;
  roiX0: number; roiY0: number;
  rulerIdx: number;
  rx1: number; ry1: number; rx2: number; ry2: number;
  tempROI: ROI|null; tempRuler: RulerLine|null;
}

// ─── Factory + utilities ───────────────────────────────────────────────────

export function mkVP(): VP {
  return {
    loadedImage: null, imageDataUrl: null, imageName: '',
    zoom: 1, panX: 0, panY: 0, contrast: 80, brightness: 100, invertColors: false,
    rois: [], rulers: [], brushStrokes: [], selectedROIId: null,
    roiCounter: 1, rulerCounter: 1, brushCounter: 1, undoStack: [], redoStack: [],
    activePreset: 'Padrão',
    pixelSpacing: null,
  };
}

export function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export function d2(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function biradsColor(b: BiRads|string|null): string {
  if (b === '1' || b === '2') return '#4ade80';
  if (b === '3') return '#facc15';
  if (b === '4A') return '#fb923c';
  if (b === '4B') return '#f97316';
  if (b === '4C') return '#ff6e84';
  if (b === '5' || b === '6') return '#dc2626';
  return '#afa2ff';
}

export function rgba(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
}

export const BIRADS_INFO: Record<string, string> = {
  '1':'Negativo', '2':'Benigno', '3':'Provavelmente benigno',
  '4A':'Baixa suspeita', '4B':'Suspeita moderada',
  '4C':'Alta suspeita', '5':'Maligno', '6':'Biópsia confirmada'
};

export const BIRADS_CHIPS: BiRads[] = ['1','2','3','4A','4B','4C','5','6'];
