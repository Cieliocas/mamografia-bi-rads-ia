"use client"

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Brain,
  Shield,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FileText,
  Loader2,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface Finding {
  id: string
  type: string
  location: string
  description: string
  confidence: number
}

interface BiRadsResult {
  category: number
  label: string
  description: string
  confidence: number
  findings: Finding[]
  recommendation: string
}

interface BiRadsPanelProps {
  result: BiRadsResult | null
  isAnalyzing: boolean
  onConfirm: () => void
  onReject: () => void
  hasImage: boolean
}

const biradsCategories = [
  {
    category: 0,
    label: "BI-RADS 0",
    shortLabel: "Incompleto",
    color: "bg-warning/15 text-warning border-warning/30",
    dotColor: "bg-warning",
    description: "Avaliacao incompleta - necessidade de exames adicionais",
  },
  {
    category: 1,
    label: "BI-RADS 1",
    shortLabel: "Negativo",
    color: "bg-success/15 text-success border-success/30",
    dotColor: "bg-success",
    description: "Negativo - nenhum achado significativo",
  },
  {
    category: 2,
    label: "BI-RADS 2",
    shortLabel: "Benigno",
    color: "bg-success/15 text-success border-success/30",
    dotColor: "bg-success",
    description: "Achado benigno",
  },
  {
    category: 3,
    label: "BI-RADS 3",
    shortLabel: "Provavelmente Benigno",
    color: "bg-info/15 text-info border-info/30",
    dotColor: "bg-info",
    description: "Achado provavelmente benigno - acompanhamento recomendado",
  },
  {
    category: 4,
    label: "BI-RADS 4",
    shortLabel: "Suspeito",
    color: "bg-warning/15 text-warning border-warning/30",
    dotColor: "bg-warning",
    description: "Anormalidade suspeita - considerar biopsia",
  },
  {
    category: 5,
    label: "BI-RADS 5",
    shortLabel: "Alta Suspeita",
    color: "bg-destructive/15 text-destructive border-destructive/30",
    dotColor: "bg-destructive",
    description: "Altamente sugestivo de malignidade",
  },
  {
    category: 6,
    label: "BI-RADS 6",
    shortLabel: "Malignidade Conhecida",
    color: "bg-destructive/15 text-destructive border-destructive/30",
    dotColor: "bg-destructive",
    description: "Malignidade comprovada por biopsia",
  },
]

function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percent >= 80
              ? "bg-success"
              : percent >= 60
                ? "bg-warning"
                : "bg-destructive"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
        {percent}%
      </span>
    </div>
  )
}

export function BiRadsPanel({
  result,
  isAnalyzing,
  onConfirm,
  onReject,
  hasImage,
}: BiRadsPanelProps) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [notes, setNotes] = useState("")

  const categoryInfo = result
    ? biradsCategories.find((c) => c.category === result.category)
    : null

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-8 items-center border-b border-border px-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Classificacao BI-RADS
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 flex flex-col gap-3">
          {isAnalyzing ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="relative">
                <Brain className="size-8 text-primary" />
                <Loader2 className="size-4 text-primary animate-spin absolute -top-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-foreground">
                  Analisando exame...
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  O modelo esta processando a imagem
                </p>
              </div>
              <div className="w-full max-w-[160px]">
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
                </div>
              </div>
            </div>
          ) : result ? (
            <Tabs defaultValue="result" className="gap-2">
              <TabsList className="w-full h-7">
                <TabsTrigger value="result" className="text-[10px] flex-1 h-6">
                  Resultado
                </TabsTrigger>
                <TabsTrigger value="findings" className="text-[10px] flex-1 h-6">
                  Achados ({result.findings.length})
                </TabsTrigger>
                <TabsTrigger value="notes" className="text-[10px] flex-1 h-6">
                  Notas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="result" className="flex flex-col gap-3 mt-0">
                {/* Main Classification Card */}
                <div className={cn(
                  "rounded-lg border-2 p-3",
                  categoryInfo?.color || "border-border"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("size-2.5 rounded-full", categoryInfo?.dotColor)} />
                      <span className="text-sm font-bold">
                        {result.label}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border bg-secondary/50 text-muted-foreground">
                      Categoria {result.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.description}
                  </p>
                </div>

                {/* Confidence */}
                <div className="rounded-md bg-secondary/30 p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Shield className="size-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Confianca do Modelo
                    </span>
                  </div>
                  <ConfidenceBar value={result.confidence} />
                </div>

                {/* Recommendation */}
                <div className="rounded-md border border-border p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Info className="size-3 text-info" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Recomendacao
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">
                    {result.recommendation}
                  </p>
                </div>

                {/* BI-RADS Scale Reference */}
                <div className="rounded-md border border-border p-2.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="size-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Tabela BI-RADS
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {biradsCategories.map((cat) => (
                      <div
                        key={cat.category}
                        className={cn(
                          "flex items-center gap-2 rounded-sm px-2 py-1 text-[10px]",
                          result.category === cat.category
                            ? "bg-secondary/80 text-foreground font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        <div className={cn("size-1.5 rounded-full shrink-0", cat.dotColor)} />
                        <span className="w-14 shrink-0 font-mono">{cat.label.split(" ")[1]}</span>
                        <span className="truncate">{cat.shortLabel}</span>
                        {result.category === cat.category && (
                          <ChevronDown className="size-2.5 ml-auto shrink-0 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="findings" className="flex flex-col gap-2 mt-0">
                {result.findings.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <CheckCircle2 className="size-6 text-success" />
                    <p className="text-xs text-muted-foreground text-center">
                      Nenhum achado significativo identificado
                    </p>
                  </div>
                ) : (
                  result.findings.map((finding) => (
                    <button
                      key={finding.id}
                      onClick={() =>
                        setExpandedFinding(
                          expandedFinding === finding.id ? null : finding.id
                        )
                      }
                      className="rounded-md border border-border p-2.5 text-left transition-colors hover:bg-secondary/30 cursor-pointer w-full"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-3 text-warning" />
                          <span className="text-xs font-medium text-foreground">
                            {finding.type}
                          </span>
                        </div>
                        {expandedFinding === finding.id ? (
                          <ChevronUp className="size-3 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-3 text-muted-foreground" />
                        )}
                      </div>
                      {expandedFinding === finding.id && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              Localizacao
                            </span>
                            <span className="text-[10px] text-foreground">
                              {finding.location}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              Confianca
                            </span>
                            <span className="text-[10px] text-foreground font-mono">
                              {(finding.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                            {finding.description}
                          </p>
                        </div>
                      )}
                    </button>
                  ))
                )}
              </TabsContent>

              <TabsContent value="notes" className="flex flex-col gap-2 mt-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="size-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Observacoes do Radiologista
                  </span>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione suas observacoes aqui..."
                  className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[120px]"
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12">
              <Brain className="size-8 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  {hasImage
                    ? "Submeta o exame para analise"
                    : "Carregue um exame para iniciar"}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {hasImage
                    ? "Clique em 'Submeter para Analise' na barra de ferramentas"
                    : "Use o painel lateral para carregar imagens"}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Action Buttons */}
      {result && !isAnalyzing && (
        <div className="border-t border-border p-3 flex flex-col gap-2">
          <Button
            onClick={onConfirm}
            className="w-full gap-2 bg-success text-success-foreground hover:bg-success/90 text-xs h-8"
            size="sm"
          >
            <CheckCircle2 className="size-3.5" />
            Confirmar Classificacao
          </Button>
          <Button
            onClick={onReject}
            variant="outline"
            className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 text-xs h-8"
            size="sm"
          >
            <XCircle className="size-3.5" />
            Rejeitar Classificacao
          </Button>
        </div>
      )}
    </div>
  )
}
