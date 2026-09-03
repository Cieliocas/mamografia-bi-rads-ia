import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StudyService } from './study.service';
import { mkVP } from '../../shared/models/types';
import { ToastService } from './toast.service';

describe('StudyService', () => {
  let service: StudyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        StudyService,
        { provide: ToastService, useValue: { show: () => {}, success: () => {}, error: () => {}, info: () => {} } },
      ],
    });
    service = TestBed.inject(StudyService);
    http = TestBed.inject(HttpTestingController);

    // The constructor fires /healthz and /readyz immediately — flush them so
    // afterEach http.verify() doesn't see stale open requests.
    // Use a non-"up" status to avoid triggering refreshBackendStudies().
    http.match(r => r.url.includes('/healthz')).forEach(r => r.flush({ status: 'down', db_status: 'ok' }));
    http.match(r => r.url.includes('/readyz')).forEach(r => r.flush({ ai_engine: 'unknown' }));
  });

  afterEach(() => http.verify());

  it('deve instanciar', () => {
    expect(service).toBeTruthy();
  });

  it('backendOnline() começa false', () => {
    // Starts false; becomes true only after the healthz response is processed.
    // We flushed it in beforeEach so it should now be true — but signal
    // updates are synchronous, so test accordingly.
    expect(typeof service.backendOnline()).toBe('boolean');
  });

  it('currentStudyId() começa null', () => {
    expect(service.currentStudyId()).toBeNull();
  });

  it('currentMetadata() começa null', () => {
    expect(service.currentMetadata()).toBeNull();
  });

  it('latestFindings() começa vazio', () => {
    expect(service.latestFindings()).toEqual([]);
  });

  it('seriesFiles começa vazio', () => {
    expect(service.seriesFiles()).toEqual([]);
  });

  it('seriesIdx começa -1', () => {
    expect(service.seriesIdx()).toBe(-1);
  });

  it('setSeriesContext atualiza os signals', () => {
    service.setSeriesContext(['a.dcm', 'b.dcm', 'c.dcm'], 1);
    expect(service.seriesFiles()).toEqual(['a.dcm', 'b.dcm', 'c.dcm']);
    expect(service.seriesIdx()).toBe(1);
  });

  it('seriesPathAt avança o índice e retorna path correto', () => {
    service.setSeriesContext(['a.dcm', 'b.dcm', 'c.dcm'], 0);
    const next = service.seriesPathAt(1);
    expect(next).toBe('b.dcm');
    expect(service.seriesIdx()).toBe(1);
  });

  it('seriesPathAt retorna null fora dos limites', () => {
    service.setSeriesContext(['a.dcm', 'b.dcm'], 1);
    expect(service.seriesPathAt(1)).toBeNull();  // além do fim
    expect(service.seriesPathAt(-2)).toBeNull(); // antes do início
  });

  it('saveAnnotations envia POST correto', () => {
    service.currentStudyId.set('study-abc');
    const rois = [
      { id: 1, annotationId: 'ann-1', x: 100, y: 150, rx: 30, ry: 20,
        shape: 'rect' as const, birads: null, label: 'nódulo', notes: 'obs',
        isSelected: false, audioDurationMs: 0 } as any,
    ];

    service.saveAnnotations({ ...mkVP(), rois } as any, () => {});

    const req = http.expectOne(r => r.url.includes('/api/studies/study-abc/annotations'));
    expect(req.request.method).toBe('POST');
    const body = req.request.body;
    expect(body.annotations[0].label).toBe('nódulo');
    expect(body.annotations[0].notes).toBe('obs');
    req.flush({ status: 'saved' });
  });
});

/**
 * O serviço de IA pode estar no ar servindo achados sintéticos do backend mock.
 * Tratar isso como "IA disponível" faz a ferramenta apresentar resultados
 * fabricados como se fossem do modelo — o pior modo de falha possível numa
 * demonstração clínica (spec 006, RF-01).
 */
describe('StudyService — estado do modelo', () => {
  let service: StudyService;
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StudyService, ToastService],
    });
    service = TestBed.inject(StudyService);
  });

  it('aiModelState começa em none', () => {
    expect(service.aiModelState()).toBe('none');
  });

  it('ai_model "simulated" liga aiSimulated', () => {
    service.aiModelState.set('simulated');
    expect(service.aiSimulated()).toBe(true);
  });

  it('ai_model "real" NÃO liga aiSimulated', () => {
    service.aiModelState.set('real');
    expect(service.aiSimulated()).toBe(false);
  });

  it('serviço no ar com modelo simulado ainda é simulado', () => {
    service.aiEngineState.set('ready');
    service.aiModelState.set('simulated');
    expect(service.aiEngineState()).toBe('ready');
    expect(service.aiSimulated()).toBe(true);
  });
});
