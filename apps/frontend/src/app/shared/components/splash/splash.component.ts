import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './splash.component.html',
})
export class SplashComponent {
  @Input() progress = 0;
}
