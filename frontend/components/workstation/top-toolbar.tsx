"use client"

import {
  Activity,
  Brain,
  MonitorDot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserProfileMenu } from "@/components/user-profile-menu"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

export function TopToolbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <Brain className="size-6 text-primary" />
          <span className="text-lg font-bold text-foreground tracking-tight">
            MammoAnnot AI
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 mr-2 border-r pr-2 border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <MonitorDot className="size-5" />
                <span className="sr-only">Monitor</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Status do Sistema</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Activity className="size-5" />
                <span className="sr-only">Atividade</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Atividade do Modelo</TooltipContent>
          </Tooltip>
        </div>

        <UserProfileMenu />
      </div>
    </header>
  )
}
