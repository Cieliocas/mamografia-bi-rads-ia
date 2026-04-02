import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import {
  FolderOpen, History, BarChart3, Wrench, HelpCircle, Plus,
  ZoomIn, ZoomOut, Hand, Edit3, Ruler, Grid3X3, Maximize2,
  ChevronRight, AlertTriangle, MapPin, Sparkles, Settings,
  User, Keyboard, RotateCw, Circle, Square, Activity, Upload, X
} from 'lucide-angular';

// lucide-angular converts name attr to PascalCase before lookup
// name="user" → looks for key "User"
// name="folder-open" → looks for key "FolderOpen"
// name="bar-chart-3" → looks for key "BarChart3"
const icons = {
  FolderOpen,
  History,
  BarChart3,
  Wrench,
  HelpCircle,
  Plus,
  ZoomIn,
  ZoomOut,
  Hand,
  Edit3,
  Ruler,
  Grid3X3,
  Grid3x3: Grid3X3, // alias: toPascalCase('grid-3x3') → 'Grid3x3'
  Maximize2,
  ChevronRight,
  AlertTriangle,
  MapPin,
  Sparkles,
  Settings,
  User,
  Keyboard,
  RotateCw,
  Circle,
  Square,
  Activity,
  Upload,
  X,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(icons) }
  ]
};
