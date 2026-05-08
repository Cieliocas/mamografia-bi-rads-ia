import { Component, inject, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, FolderOpen, FolderInput, Users, Sparkles, CheckCircle, XCircle, Clock } from 'lucide-angular';
import { StudyService } from '../../core/services/study.service';

@Component({
  selector: 'app-home-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './home-panel.component.html',
})
export class HomePanelComponent implements OnInit {
  readonly study = inject(StudyService);

  @Output() openFile      = new EventEmitter<void>();
  @Output() openFolder    = new EventEmitter<void>();
  @Output() goToPatients  = new EventEmitter<void>();

  readonly icons = { FolderOpen, FolderInput, Users, Sparkles, CheckCircle, XCircle, Clock };

  greeting = '';
  dateStr  = '';

  ngOnInit() {
    const now = new Date();
    const h   = now.getHours();
    this.greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    this.dateStr  = now.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  get aiReady(): boolean { return this.study.aiEngineState() === 'ready'; }
  get recentFiles() { return this.study.historyFiles.slice(0, 6); }
}
