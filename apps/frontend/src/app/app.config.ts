import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import {
  FolderOpen, History, BarChart3, Wrench, HelpCircle, Plus,
  ZoomIn, ZoomOut, Hand, Ruler, Maximize2, ChevronRight, ChevronLeft,
  AlertTriangle, Settings, User, RotateCw, Activity, Upload, X,
  Trash2, Pencil, Target, Circle, Square, Edit3, Columns, Copy, Undo, Redo
} from 'lucide-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withFetch()),
    {
      provide: LUCIDE_ICONS, multi: true,
      useValue: new LucideIconProvider({
        FolderOpen, History, BarChart3, Wrench, HelpCircle, Plus,
        ZoomIn, ZoomOut, Hand, Ruler, Maximize2, ChevronRight, ChevronLeft,
        AlertTriangle, Settings, User, RotateCw, Activity, Upload, X,
        Trash2, Pencil, Target, Circle, Square, Edit3, Columns, Copy, Undo, Redo
      })
    }
  ]
};
