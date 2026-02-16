"use client"

import {
  Upload,
  FolderOpen,
  Search,
  ClipboardCheck,
  BarChart3,
  History,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface ActivityBarProps {
  activeView: string
  onViewChange: (view: string) => void
}

const topItems = [
  { id: "upload", icon: Upload, label: "Carregar Exame" },
  { id: "explorer", icon: FolderOpen, label: "Explorador de Estudos" },
  { id: "search", icon: Search, label: "Buscar" },
  { id: "review", icon: ClipboardCheck, label: "Revisao BI-RADS" },
  { id: "analytics", icon: BarChart3, label: "Estatisticas" },
  { id: "history", icon: History, label: "Historico" },
]

const bottomItems = [
  { id: "settings", icon: Settings, label: "Configuracoes" },
]

export function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <aside className="flex w-11 flex-col items-center justify-between border-r border-border bg-card py-2">
      <div className="flex flex-col items-center gap-0.5">
        {topItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "size-9 p-0 text-muted-foreground hover:text-foreground hover:bg-secondary",
                  activeView === item.id &&
                    "text-primary border-l-2 border-l-primary rounded-none bg-secondary/50 hover:text-primary"
                )}
              >
                <item.icon className="size-4" />
                <span className="sr-only">{item.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        {bottomItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "size-9 p-0 text-muted-foreground hover:text-foreground hover:bg-secondary",
                  activeView === item.id &&
                    "text-primary border-l-2 border-l-primary rounded-none bg-secondary/50"
                )}
              >
                <item.icon className="size-4" />
                <span className="sr-only">{item.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </aside>
  )
}
