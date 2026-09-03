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

  // ── Provenance ────────────────────────────────────────────────────────────
  // Where this ROI came from. Set when a radiologist accepts an AI suggestion,
  // so the pair (suggested, corrected) survives the edit. Persistence of these
  // fields lands in spec 003; spec 002 only has to stop throwing them away.
  /** Absent means the radiologist drew it from scratch. */
  source?: AnnotationSource;
  /** Model that produced the suggestion (FindingResponse.model_id). */
  modelId?: string;
  aiConfidence?: number;
  aiKind?: string;
  aiBirads?: string;
  /** Geometry as the model suggested it, before any human correction. */
  aiBbox?: BBox;
}

/** Where an annotation came from — the basis of the retraining signal. */
export type AnnotationSource = 'manual'|'ai_accepted'|'ai_edited'|'ai_rejected';

/** Axis-aligned box in source-image pixels: top-left corner plus size. */
export interface BBox { x: number; y: number; w: number; h: number; }

/** Lifecycle of an AI suggestion inside one viewport. */
export type AiFindingStatus = 'pending'|'accepted'|'rejected';

/**
 * One suggestion from the inference sidecar, held per viewport.
 *
 * `kind: "assessment"` is an image-level verdict with no location — the gate
 * closed, so the detector never ran. It has no `bbox` and must never be drawn
 * as a rectangle. Absence of a box is NOT absence of a lesion: the gate misses
 * roughly 31% of malignant cases, so the UI has to say so out loud.
 */
export interface AiFinding {
  id: string;
  kind: string;
  birads: string;
  confidence: number;
  /** Source-image pixels. Absent on image-level assessments. */
  bbox?: BBox;
  notes: string;
  modelId: string;
  status: AiFindingStatus;
}

/**
 * Converts a sidecar bounding box into ROI geometry.
 *
 * The sidecar sends top-left corner plus size, in pixels of the source image;
 * a ROI is centre plus radii. The DICOM preview is rendered at native
 * resolution, so the mapping is 1:1 — there is no display scaling to undo.
 */
export function bboxToRoiGeometry(b: BBox): { x: number; y: number; rx: number; ry: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 };
}

/** Inverse of bboxToRoiGeometry — used to compare a corrected ROI against the
 *  geometry the model originally suggested. */
export function roiGeometryToBBox(r: { x: number; y: number; rx: number; ry: number }): BBox {
  return { x: r.x - r.rx, y: r.y - r.ry, w: r.rx * 2, h: r.ry * 2 };
}

/**
 * True when a ROI accepted from the model no longer matches what it suggested.
 *
 * This is what separates `ai_accepted` from `ai_edited`, and it is the whole
 * reason the original box is kept: a correction says where the model was wrong,
 * which a fresh annotation never does.
 *
 * The tolerance absorbs float noise from the centre/radius round-trip — a
 * sub-pixel difference is not a radiologist's correction.
 */
export function geometryDiffers(r: ROI, tolerancePx = 0.5): boolean {
  if (!r.aiBbox) return false;
  const cur = roiGeometryToBBox(r);
  return Math.abs(cur.x - r.aiBbox.x) > tolerancePx
      || Math.abs(cur.y - r.aiBbox.y) > tolerancePx
      || Math.abs(cur.w - r.aiBbox.w) > tolerancePx
      || Math.abs(cur.h - r.aiBbox.h) > tolerancePx;
}

/** True when the finding carries a drawable region. */
export function hasRegion(f: AiFinding): boolean {
  return !!f.bbox && f.bbox.w > 0 && f.bbox.h > 0;
}

/** Outline colour for AI suggestions — deliberately outside the BI-RADS palette
 *  so a suggestion never reads as a validated marking. */
export const AI_SUGGESTION_COLOR = '#22d3ee';

/** Cor das caixas em modo simulado — âmbar de advertência, para que a marcação
 *  se denuncie na própria imagem e não possa ser confundida, mesmo numa captura
 *  de tela isolada, com saída de um modelo treinado. */
export const SIMULATED_COLOR = '#f59e0b';

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
  /** Pending/decided AI suggestions for the image in this viewport. */
  aiFindings: AiFinding[];
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
    rois: [], rulers: [], brushStrokes: [], aiFindings: [], selectedROIId: null,
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
