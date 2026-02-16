"use client"

import {
  Activity,
  Settings,
  HelpCircle,
  Brain,
  MonitorDot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

export function TopToolbar() {
  return (
    <header className="flex h-10 items-center justify-between border-b border-border bg-card px-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Brain className="size-5 text-primary" />
          <span className="text-sm font-semibold text-foreground tracking-tight">
            MammoAnnot
          </span>
        </div>
        <div className="mx-2 h-4 w-px bg-border" />
        <nav className="flex items-center gap-0.5">
          {["Arquivo", "Visualizar", "Ferramentas", "Ajuda"].map((item) => (
            <Button
              key={item}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              {item}
            </Button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-foreground">
              <MonitorDot className="size-3.5" />
              <span className="sr-only">Monitor</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Status do Sistema</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-foreground">
              <Activity className="size-3.5" />
              <span className="sr-only">Atividade</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Atividade do Modelo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-foreground">
              <Settings className="size-3.5" />
              <span className="sr-only">Configuracoes</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Configuracoes</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-foreground">
              <HelpCircle className="size-3.5" />
              <span className="sr-only">Ajuda</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Ajuda</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
