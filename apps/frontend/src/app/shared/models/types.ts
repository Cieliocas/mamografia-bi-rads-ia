// ─── Domain types ─────────────────────────────────────────────────────────────

export type BiRads = '1'|'2'|'3'|'4A'|'4B'|'4C'|'5'|'6'|null;

export interface ROI {
  id: number; x: number; y: number;
  rx: number; ry: number;
  shape: 'ellipse'|'rect';
  birads: BiRads; label: string; notes: string;
  isSelected: boolean;
}

export interface RulerLine {
  id: number; x1: number; y1: number; x2: number; y2: number;
  isSelected: boolean;
}

export interface Snapshot { rois: ROI[]; rulers: RulerLine[]; }

/** Viewport — one imaging slot (left or right in split mode). */
export interface VP {
  loadedImage: HTMLImageElement|null;
  imageDataUrl: string|null;
  imageName: string;
  zoom: number; panX: number; panY: number;
  contrast: number; brightness: number;
  rois: ROI[]; rulers: RulerLine[];
  selectedROIId: number|null;
  roiCounter: number; rulerCounter: number;
  undoStack: Snapshot[]; redoStack: Snapshot[];
}

export type IxMode =
  'pan'|'draw-roi'|'draw-ruler'|
  'move-roi'|'move-ruler-full'|'move-ruler-start'|'move-ruler-end';

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
    zoom: 1, panX: 0, panY: 0, contrast: 80, brightness: 100,
    rois: [], rulers: [], selectedROIId: null,
    roiCounter: 1, rulerCounter: 1, undoStack: [], redoStack: []
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
