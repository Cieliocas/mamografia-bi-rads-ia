import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let seq = 0;

/**
 * Lightweight toast service — show non-blocking feedback messages that
 * auto-dismiss after a configurable duration.
 *
 * Usage:
 *   this.toast.show('Anotações salvas', 'success');
 *   this.toast.show('Falha ao exportar', 'error');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, kind: ToastKind = 'info', durationMs = 3500) {
    const id = ++seq;
    this.toasts.update(list => [...list, { id, message, kind }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  success(msg: string, ms = 3500) { this.show(msg, 'success', ms); }
  error(msg: string, ms = 5000)   { this.show(msg, 'error',   ms); }
  warn(msg: string, ms = 4000)    { this.show(msg, 'warn',    ms); }
  info(msg: string, ms = 3500)    { this.show(msg, 'info',    ms); }
}
