"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Move,
  Crosshair,
  Sun,
  Contrast,
  RotateCcw,
  Upload,
  Send,
  Loader2,
  ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Slider } from "@/components/ui/slider"

interface ImageViewerProps {
  imageSrc: string | null
  fileName: string | null
  isAnalyzing: boolean
  onSubmitForAnalysis: () => void
  onUploadClick: () => void
  annotations: Array<{
    x: number
    y: number
    width: number
    height: number
    label: string
    confidence: number
  }>
  maskSrc?: string | null
}

interface ToolButtonProps {
  icon: React.ElementType
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}

function ToolButton({ icon: Icon, label, active, onClick, disabled }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "size-8 p-0 text-muted-foreground hover:text-foreground hover:bg-secondary",
            active && "bg-primary/15 text-primary hover:text-primary hover:bg-primary/20"
          )}
        >
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ImageViewer({
  imageSrc,
  fileName,
  isAnalyzing,
  onSubmitForAnalysis,
  onUploadClick,
  annotations,
  maskSrc,
}: ImageViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [maskOpacity, setMaskOpacity] = useState(0.5)
  const [activeTool, setActiveTool] = useState<"pan" | "crosshair">("pan")
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showAdjustments, setShowAdjustments] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 500))
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25))
  const handleRotateCW = () => setRotation((r) => (r + 90) % 360)
  const handleRotateCCW = () => setRotation((r) => (r - 90 + 360) % 360)
  const handleFlipH = () => setFlipH((f) => !f)
  const handleFlipV = () => setFlipV((f) => !f)
  const handleReset = () => {
    setZoom(100)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setBrightness(100)
    setContrast(100)
    setMaskOpacity(0.5)
    setOffset({ x: 0, y: 0 })
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === "pan") {
        setIsDragging(true)
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
      }
    },
    [activeTool, offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging && activeTool === "pan") {
        setOffset({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        })
      }
    },
    [isDragging, activeTool, dragStart]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -10 : 10
    setZoom((z) => Math.max(25, Math.min(500, z + delta)))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false })
      return () => container.removeEventListener("wheel", handleWheel)
    }
  }, [handleWheel])

  const imageStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
    transition: isDragging ? "none" : "transform 0.2s ease, filter 0.2s ease",
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Viewer Toolbar */}
      <div className="flex h-9 items-center justify-between border-b border-border bg-card px-2">
        <div className="flex items-center gap-0.5">
          <ToolButton
            icon={Move}
            label="Mover (Pan)"
            active={activeTool === "pan"}
            onClick={() => setActiveTool("pan")}
            disabled={!imageSrc}
          />
          <ToolButton
            icon={Crosshair}
            label="Cursor"
            active={activeTool === "crosshair"}
            onClick={() => setActiveTool("crosshair")}
            disabled={!imageSrc}
          />
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolButton icon={ZoomIn} label="Zoom In" onClick={handleZoomIn} disabled={!imageSrc} />
          <ToolButton icon={ZoomOut} label="Zoom Out" onClick={handleZoomOut} disabled={!imageSrc} />
          <span className="mx-1 text-[10px] text-muted-foreground font-mono w-10 text-center">
            {zoom}%
          </span>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolButton icon={RotateCcw} label="Rotacionar Anti-horario" onClick={handleRotateCCW} disabled={!imageSrc} />
          <ToolButton icon={RotateCw} label="Rotacionar Horario" onClick={handleRotateCW} disabled={!imageSrc} />
          <ToolButton icon={FlipHorizontal} label="Espelhar Horizontal" onClick={handleFlipH} disabled={!imageSrc} />
          <ToolButton icon={FlipVertical} label="Espelhar Vertical" onClick={handleFlipV} disabled={!imageSrc} />
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolButton
            icon={Sun}
            label="Ajustes de Brilho/Contraste"
            active={showAdjustments}
            onClick={() => setShowAdjustments(!showAdjustments)}
            disabled={!imageSrc}
          />
          <ToolButton icon={Maximize2} label="Resetar Visualizacao" onClick={handleReset} disabled={!imageSrc} />
        </div>

        <div className="flex items-center gap-1.5">
          {imageSrc && !isAnalyzing && (
            <Button
              size="sm"
              onClick={onSubmitForAnalysis}
              className="h-6 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-3"
            >
              <Send className="size-3" />
              Submeter para Analise
            </Button>
          )}
          {isAnalyzing && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="size-3 animate-spin" />
              Analisando...
            </div>
          )}
        </div>
      </div>

      {/* Brightness/Contrast Adjustments Bar */}
      {showAdjustments && imageSrc && (
        <div className="flex flex-col gap-2 border-b border-border bg-card/80 px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Sun className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">Brilho</span>
              <Slider
                value={[brightness]}
                onValueChange={([v]) => setBrightness(v)}
                min={0}
                max={200}
                step={5}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                {brightness}%
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 flex-1">
              <Contrast className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">Contraste</span>
              <Slider
                value={[contrast]}
                onValueChange={([v]) => setContrast(v)}
                min={0}
                max={200}
                step={5}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                {contrast}%
              </span>
            </div>
          </div>

          {/* Mask Opacity Slider (Only if mask exists) */}
          {maskSrc && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <div className="size-3.5 rounded-full border border-primary/50 bg-primary/20 shrink-0" />
              <span className="text-[10px] text-muted-foreground w-12 shrink-0">Mascara</span>
              <Slider
                value={[maskOpacity]}
                onValueChange={([v]) => setMaskOpacity(v)}
                min={0}
                max={1}
                step={0.1}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
                {(maskOpacity * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Image Canvas */}
      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 overflow-hidden bg-[oklch(0.08_0.005_260)]",
          activeTool === "pan" && imageSrc && "cursor-grab",
          isDragging && "cursor-grabbing",
          activeTool === "crosshair" && imageSrc && "cursor-crosshair"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {imageSrc ? (
          <div className="relative flex h-full w-full items-center justify-center">
            {/* Crosshair guides */}
            {activeTool === "crosshair" && (
              <>
                <div className="absolute inset-y-0 left-1/2 w-px bg-primary/20" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-primary/20" />
              </>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={fileName || "Exame de mamografia"}
              className="max-h-full max-w-full select-none object-contain"
              style={imageStyle}
              draggable={false}
            />

            {maskSrc && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={maskSrc}
                alt="Segmentation Mask"
                className="absolute inset-0 h-full w-full select-none object-contain pointer-events-none"
                style={{
                  ...imageStyle,
                  opacity: maskOpacity ?? 0.5,
                  filter: undefined,
                  transition: isDragging ? "none" : "transform 0.2s ease",
                }}
                draggable={false}
              />
            )}

            {/* Annotation Overlays */}
            {annotations.map((ann, i) => (
              <div
                key={i}
                className="absolute border-2 border-primary rounded-sm pointer-events-none"
                style={{
                  left: `${ann.x}%`,
                  top: `${ann.y}%`,
                  width: `${ann.width}%`,
                  height: `${ann.height}%`,
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`,
                }}
              >
                <div className="absolute -top-5 left-0 rounded-sm bg-primary px-1.5 py-0.5">
                  <span className="text-[9px] font-medium text-primary-foreground">
                    {ann.label} ({(ann.confidence * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
            ))}

            {/* Info Overlay */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-card/90 px-2.5 py-1.5 backdrop-blur-sm border border-border">
              <span className="text-[10px] text-muted-foreground font-mono">
                {fileName}
              </span>
              <div className="h-3 w-px bg-border" />
              <span className="text-[10px] text-muted-foreground font-mono">
                {zoom}%
              </span>
              {rotation !== 0 && (
                <>
                  <div className="h-3 w-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {rotation}°
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl bg-secondary/50 p-4">
                <ImageIcon className="size-10 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhum exame carregado
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Carregue um exame DICOM ou imagem para iniciar a analise
                </p>
              </div>
            </div>
            <Button
              onClick={onUploadClick}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              <Upload className="size-3.5" />
              Carregar Exame
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
