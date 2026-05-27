import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ChevronDown, ChevronRight, Info } from 'lucide-angular';
import { StudyService, StudyMetadata } from '../../core/services/study.service';

interface DicomGroup {
  label: string;
  key: string;
  rows: DicomRow[];
}

interface DicomRow {
  label: string;
  value: string | number | undefined;
  unit?: string;
}

@Component({
  selector: 'app-dicom-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="flex flex-col h-full overflow-y-auto text-xs text-zinc-300 select-text">

      @if (!study.currentStudyId()) {
        <div class="flex flex-col items-center justify-center h-full gap-2 text-zinc-500 px-4 text-center">
          <lucide-icon [img]="icons.Info" class="w-8 h-8 opacity-40" />
          <p>Abra um exame para ver os metadados DICOM.</p>
        </div>
      } @else {

        <!-- File path hint -->
        <div class="px-3 py-2 border-b border-zinc-700/50 text-zinc-500 truncate" title="Study ID">
          ID: {{ study.currentStudyId() }}
        </div>

        <!-- Groups -->
        @for (group of groups(); track group.key) {
          @if (group.rows.length > 0) {
            <div class="border-b border-zinc-700/40">
              <!-- Group header -->
              <button
                class="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-700/30 text-left font-semibold text-zinc-400 uppercase tracking-wider text-[10px]"
                (click)="toggle(group.key)">
                <lucide-icon
                  [img]="collapsed()[group.key] ? icons.ChevronRight : icons.ChevronDown"
                  class="w-3 h-3 shrink-0" />
                {{ group.label }}
              </button>

              <!-- Rows -->
              @if (!collapsed()[group.key]) {
                <div class="pb-1">
                  @for (row of group.rows; track row.label) {
                    <div class="grid grid-cols-[45%_55%] px-3 py-0.5 hover:bg-zinc-700/20 gap-1">
                      <span class="text-zinc-500 truncate" [title]="row.label">{{ row.label }}</span>
                      <span class="text-zinc-200 truncate font-mono" [title]="fmt(row)">
                        {{ fmt(row) }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        }

      }
    </div>
  `,
})
export class DicomPanelComponent {
  readonly study = inject(StudyService);
  readonly icons = { ChevronDown, ChevronRight, Info };

  /** Tracks which groups are collapsed. */
  readonly collapsed = signal<Record<string, boolean>>({});

  toggle(key: string) {
    this.collapsed.update(s => ({ ...s, [key]: !s[key] }));
  }

  fmt(row: DicomRow): string {
    if (row.value === undefined || row.value === null || row.value === '') return '—';
    const v = typeof row.value === 'number'
      ? (Number.isInteger(row.value) ? row.value.toString() : row.value.toFixed(3))
      : String(row.value);
    return row.unit ? `${v} ${row.unit}` : v;
  }

  /** Builds the groups from live metadata. */
  get groups(): () => DicomGroup[] {
    return () => {
      const m = this.study.currentMetadata();
      if (!m) return [];

      return [
        {
          label: 'Paciente', key: 'patient',
          rows: rows([
            ['Nome',         m.patientName],
            ['ID',           m.patientBirthDate ? undefined : undefined], // shown in header
            ['Data Nasc.',   formatDate(m.patientBirthDate)],
            ['Sexo',         formatSex(m.patientSex)],
          ]),
        },
        {
          label: 'Exame', key: 'study',
          rows: rows([
            ['Data',         formatDate(m.studyDate)],
            ['Descrição',    m.studyDescription],
            ['Acesso nº',    m.accessionNumber],
            ['UID',          abbrev(m.studyInstanceUID)],
          ]),
        },
        {
          label: 'Série', key: 'series',
          rows: rows([
            ['Modalidade',   m.modality],
            ['Série nº',     m.seriesNumber],
            ['Lateralidade', m.laterality],
            ['Projeção',     m.viewPosition],
            ['Região',       m.bodyPartExamined],
            ['Descrição',    m.description],
          ]),
        },
        {
          label: 'Equipamento', key: 'equipment',
          rows: rows([
            ['Fabricante',   m.manufacturer],
            ['Modelo',       m.manufacturerModel],
            ['Instituição',  m.institutionName],
            ['Estação',      m.stationName],
          ]),
        },
        {
          label: 'Aquisição', key: 'acquisition',
          rows: rows([
            ['kVp',          m.kvp,              'kV'],
            ['Tempo Exp.',   m.exposureTimeMs,   'ms'],
            ['Corrente',     m.tubeCurrentMa,    'mA'],
            ['Exposição',    m.exposureMas,      'mAs'],
            ['Compressão',   m.compressionForceN,'N'],
            ['Pixel Imager', m.imagerPixelSpacing,'mm'],
          ]),
        },
        {
          label: 'Imagem', key: 'image',
          rows: rows([
            ['Dimensões',    dims(m)],
            ['Pixel (mm)',   m.pixelSpacing,     'mm'],
            ['Bits armazen.',m.bitsStored],
            ['Bits alocad.', m.bitsAllocated],
            ['Fotométrico',  m.photometric],
            ['Frames',       (m.frameCount && m.frameCount > 1) ? m.frameCount : undefined],
          ]),
        },
      ];
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a DicomRow array, filtering out entries with no value. */
function rows(entries: [string, string | number | undefined, string?][]): DicomRow[] {
  return entries
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([label, value, unit]) => ({ label, value, unit }));
}

/** YYYYMMDD → DD/MM/YYYY */
function formatDate(d: string | undefined): string | undefined {
  if (!d || d.length < 8) return d;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

function formatSex(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s === 'F' ? 'Feminino' : s === 'M' ? 'Masculino' : s;
}

/** Abbreviates a long UID to last 12 chars for display. */
function abbrev(uid: string | undefined): string | undefined {
  if (!uid) return undefined;
  return uid.length > 16 ? `…${uid.slice(-12)}` : uid;
}

/** Formats "WxH" from metadata. */
function dims(m: StudyMetadata): string | undefined {
  const w = m.columns ?? m.width;
  const h = m.rows ?? m.height;
  if (!w || !h) return undefined;
  return `${w} × ${h} px`;
}
