import { TestBed } from '@angular/core/testing';
import { ViewerStateService } from './viewer-state.service';

describe('ViewerStateService', () => {
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ViewerStateService] });
    state = TestBed.inject(ViewerStateService);
  });

  // ── Initial values ───────────────────────────────────────────────────────

  it('deve instanciar', () => expect(state).toBeTruthy());

  it('activeTool começa como pan', () => expect(state.activeTool).toBe('pan'));

  it('activeVp começa 0', () => expect(state.activeVp).toBe(0));

  it('gridLayout começa 1x1', () => expect(state.gridLayout).toBe('1x1'));

  it('splitMode é false na layout 1x1', () => expect(state.splitMode).toBe(false));

  it('vpCount é 1 na layout 1x1', () => expect(state.vpCount).toBe(1));

  it('vpCount é 2 na layout 1x2', () => {
    state.setGrid('1x2', () => {});
    expect(state.vpCount).toBe(2);
  });

  it('vpCount é 4 na layout 2x2', () => {
    state.setGrid('2x2', () => {});
    expect(state.vpCount).toBe(4);
  });

  it('activePanel começa como home', () => expect(state.activePanel).toBe('home'));

  // ── Tool / panel controls ────────────────────────────────────────────────

  it('setTool atualiza activeTool', () => {
    state.setTool('roi');
    expect(state.activeTool).toBe('roi');
  });

  it('setTool limpa ix', () => {
    (state as any).ix = { some: 'value' };
    state.setTool('pan');
    expect(state.ix).toBeNull();
  });

  it('setPanel atualiza activePanel', () => {
    state.setPanel('files');
    expect(state.activePanel).toBe('files');
  });

  it('toggleLeftSidebar alterna leftOpen', () => {
    const was = state.leftOpen;
    state.toggleLeftSidebar();
    expect(state.leftOpen).toBe(!was);
  });

  it('toggleRightPanel alterna rightOpen', () => {
    const was = state.rightOpen;
    state.toggleRightPanel();
    expect(state.rightOpen).toBe(!was);
  });

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  it('snap adiciona ao undoStack e limpa redoStack', () => {
    state.snap(0);
    expect(state.vp[0].undoStack.length).toBe(1);
    expect(state.vp[0].redoStack.length).toBe(0);
  });

  it('undo restaura estado anterior', () => {
    // Push a sentinel ROI manually, snap, then clear ROIs.
    const vp = state.vp[0];
    vp.rois = [{ id: 1 } as any];
    state.snap(0);
    vp.rois = [];

    state.undo(0, () => {});
    expect(vp.rois.length).toBe(1);
  });

  it('redo restaura estado após undo', () => {
    const vp = state.vp[0];
    vp.rois = [{ id: 1 } as any];
    state.snap(0);
    vp.rois = [];

    state.undo(0, () => {});  // rois=[{id:1}]
    state.redo(0, () => {});  // rois=[]
    expect(vp.rois.length).toBe(0);
  });

  it('undo sem histórico não lança erro', () => {
    expect(() => state.undo(0, () => {})).not.toThrow();
  });

  // ── Clipboard ────────────────────────────────────────────────────────────

  it('copyROI e pasteROI clonam o ROI com offset', () => {
    const vp = state.vp[0];
    const roi = { id: 1, annotationId: '', x: 50, y: 60, rx: 10, ry: 10,
                  shape: 'ellipse', birads: null, label: '', notes: '',
                  isSelected: true, audioDurationMs: 0 } as any;
    vp.rois = [roi];
    state.selectedROI = roi;

    state.copyROI();
    expect(state.clipboard).toBeTruthy();

    state.pasteROI(() => {});
    expect(vp.rois.length).toBe(2);
    expect(vp.rois[1].x).toBe(70);  // 50 + 20
    expect(vp.rois[1].y).toBe(80);  // 60 + 20
  });

  // ── toggleInvert ─────────────────────────────────────────────────────────

  it('toggleInvert inverte invertColors do VP ativo', () => {
    const was = state.vp[0].invertColors;
    state.toggleInvert(() => {});
    expect(state.vp[0].invertColors).toBe(!was);
  });

  // ── annotationsChanged$ ───────────────────────────────────────────────────

  it('snap emite no annotationsChanged$', () => new Promise<void>((resolve) => {
    state.annotationsChanged$.subscribe(vpIdx => {
      expect(vpIdx).toBe(0);
      resolve();
    });
    state.snap(0);
  }));
});
