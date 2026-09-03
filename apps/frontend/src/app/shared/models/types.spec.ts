import {
  bboxToRoiGeometry, roiGeometryToBBox, hasRegion, mkVP, geometryDiffers,
} from './types';
import type { AiFinding, BBox, ROI } from './types';

/**
 * Geometry conversion between the sidecar's boxes and the viewer's ROIs.
 *
 * The sidecar sends top-left + size in source-image pixels; a ROI is centre +
 * radii. Getting this wrong puts the suggestion on the wrong part of the
 * breast, which is worse than showing nothing at all — so it is pinned here.
 */
describe('bboxToRoiGeometry', () => {
  it('converte canto+tamanho em centro+raios', () => {
    expect(bboxToRoiGeometry({ x: 100, y: 200, w: 40, h: 60 }))
      .toEqual({ x: 120, y: 230, rx: 20, ry: 30 });
  });

  it('é reversível — a ida e volta preserva a caixa original', () => {
    const b: BBox = { x: 734, y: 867, w: 175, h: 165 };
    expect(roiGeometryToBBox(bboxToRoiGeometry(b))).toEqual(b);
  });

  it('preserva a caixa real medida na integração (spec 001 CA-02)', () => {
    const g = bboxToRoiGeometry({ x: 734, y: 867, w: 175, h: 165 });
    expect(g.x).toBeCloseTo(821.5);
    expect(g.y).toBeCloseTo(949.5);
  });
});

describe('hasRegion', () => {
  const base: AiFinding = {
    id: 'x', kind: 'mass', birads: '3', confidence: 0.6,
    notes: '', modelId: 'm', status: 'pending',
  };

  it('achado com caixa tem região', () => {
    expect(hasRegion({ ...base, bbox: { x: 1, y: 1, w: 10, h: 10 } })).toBe(true);
  });

  it('assessment sem caixa não tem região', () => {
    expect(hasRegion({ ...base, kind: 'assessment' })).toBe(false);
  });

  it('caixa de área zero não é região — é assessment com bbox zerada', () => {
    expect(hasRegion({ ...base, bbox: { x: 0, y: 0, w: 0, h: 0 } })).toBe(false);
  });
});

describe('mkVP', () => {
  it('nasce sem sugestões de IA', () => expect(mkVP().aiFindings).toEqual([]));
});


/**
 * Telling `ai_accepted` from `ai_edited` is the whole reason the model's
 * original box is kept. Get this wrong and every correction is filed as a plain
 * acceptance — the retraining set loses exactly the information it exists for.
 */
describe('geometryDiffers', () => {
  const roi = (over: Partial<ROI>): ROI => ({
    id: 1, x: 120, y: 230, rx: 20, ry: 30, shape: 'rect',
    birads: null, label: '', notes: '', isSelected: false, ...over,
  });

  it('sem sugestão de origem, nada difere', () => {
    expect(geometryDiffers(roi({}))).toBe(false);
  });

  it('aceita sem mexer — não difere', () => {
    expect(geometryDiffers(roi({ aiBbox: { x: 100, y: 200, w: 40, h: 60 } }))).toBe(false);
  });

  it('ROI movida — difere', () => {
    expect(geometryDiffers(roi({ x: 160, aiBbox: { x: 100, y: 200, w: 40, h: 60 } }))).toBe(true);
  });

  it('ROI redimensionada — difere', () => {
    expect(geometryDiffers(roi({ rx: 35, aiBbox: { x: 100, y: 200, w: 40, h: 60 } }))).toBe(true);
  });

  it('ruído sub-pixel do arredondamento não conta como correção', () => {
    expect(geometryDiffers(roi({ x: 120.2, aiBbox: { x: 100, y: 200, w: 40, h: 60 } }))).toBe(false);
  });
});
