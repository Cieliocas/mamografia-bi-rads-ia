import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, X as XIcon, Keyboard } from 'lucide-angular';

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; description: string }[];
}

@Component({
  selector: 'app-shortcuts-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './shortcuts-modal.component.html',
})
export class ShortcutsModalComponent {

  @Output() closed = new EventEmitter<void>();

  readonly icons = { XIcon, Keyboard };

  readonly groups: ShortcutGroup[] = [
    {
      title: 'Ferramentas',
      items: [
        { keys: ['P'],        description: 'Pan (mover imagem)' },
        { keys: ['R'],        description: 'ROI — anotar região' },
        { keys: ['L'],        description: 'Régua' },
        { keys: ['A'],        description: 'Seta' },
        { keys: ['B'],        description: 'Pincel livre' },
        { keys: ['E'],        description: 'Apagar ROI (clique)' },
        { keys: ['⇧', 'E'],  description: 'Apagar Régua / Seta' },
        { keys: ['I'],        description: 'Inverter cores do VP ativo' },
      ]
    },
    {
      title: 'Navegação & Zoom',
      items: [
        { keys: ['+'],        description: 'Ampliar' },
        { keys: ['-'],        description: 'Reduzir' },
        { keys: ['F'],        description: 'Ajustar à tela (fit)' },
        { keys: ['0'],        description: 'Ajustar à tela (alt)' },
        { keys: ['←'],        description: 'Arquivo anterior na série' },
        { keys: ['→'],        description: 'Próximo arquivo na série' },
        { keys: ['⌘', '⇧', 'O'], description: 'Abrir pasta…' },
        { keys: ['⌘', 'L'],  description: 'Painel de Laudo' },
      ]
    },
    {
      title: 'Layout de grade',
      items: [
        { keys: ['1'],        description: '1×1 — viewport único' },
        { keys: ['2'],        description: '1×2 — lado a lado' },
        { keys: ['4'],        description: '2×2 — grade 4 painéis' },
        { keys: ['6'],        description: '2×3 — grade 6 painéis' },
      ]
    },
    {
      title: 'Anotações',
      items: [
        { keys: ['⌘', 'Z'],  description: 'Desfazer' },
        { keys: ['⌘', 'Y'],  description: 'Refazer' },
        { keys: ['⌘', 'C'],  description: 'Copiar ROI' },
        { keys: ['⌘', 'V'],  description: 'Colar ROI' },
        { keys: ['⌘', 'S'],  description: 'Salvar anotações' },
        { keys: ['Del'],      description: 'Remover ROI selecionada' },
        { keys: ['Esc'],      description: 'Desselecionar ROI' },
      ]
    },
    {
      title: 'BI-RADS rápido (ROI selecionada)',
      items: [
        { keys: ['1'],        description: 'BI-RADS 1' },
        { keys: ['2'],        description: 'BI-RADS 2' },
        { keys: ['3'],        description: 'BI-RADS 3' },
        { keys: ['4'],        description: 'BI-RADS 4A → 4B → 4C (cicla)' },
        { keys: ['5'],        description: 'BI-RADS 5' },
        { keys: ['6'],        description: 'BI-RADS 6' },
      ]
    },
  ];
}
