import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm font-medium shadow-xl
                 pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-200"
          [class]="kindClass(t.kind)">
          <span class="shrink-0 text-base leading-none">{{ kindIcon(t.kind) }}</span>
          <span class="flex-1 text-[13px] leading-snug">{{ t.message }}</span>
          <button
            class="shrink-0 opacity-60 hover:opacity-100 transition leading-none"
            (click)="toast.dismiss(t.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  readonly toast = inject(ToastService);

  kindClass(kind: string): string {
    switch (kind) {
      case 'success': return 'bg-emerald-900/90 border border-emerald-500/40 text-emerald-100';
      case 'error':   return 'bg-red-900/90 border border-red-500/40 text-red-100';
      case 'warn':    return 'bg-amber-900/90 border border-amber-500/40 text-amber-100';
      default:        return 'bg-neutral-800/95 border border-white/10 text-neutral-100';
    }
  }

  kindIcon(kind: string): string {
    switch (kind) {
      case 'success': return '✓';
      case 'error':   return '✕';
      case 'warn':    return '⚠';
      default:        return 'ℹ';
    }
  }
}
