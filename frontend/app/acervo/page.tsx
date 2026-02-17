"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Search, Tag, User, Calendar, Edit, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AspectRatio } from "@/components/ui/aspect-ratio"

interface ImageItem {
    id: number
    filename: string
    original_filename: string
    patient_id: string
    patient_name: string
    tags: string
    classification: string
    created_at: string
}

export default function AcervoPage() {
    const { user, token } = useAuth()
    const router = useRouter()
    const [images, setImages] = useState<ImageItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Edit State
    const [editingImage, setEditingImage] = useState<ImageItem | null>(null)
    const [editPatientId, setEditPatientId] = useState("")
    const [editPatientName, setEditPatientName] = useState("")
    const [editTags, setEditTags] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (token) {
            fetchImages()
        }
    }, [token])

    const fetchImages = async () => {
        setIsLoading(true)
        try {
            const response = await fetch("/acervo/images", {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setImages(data)
            } else {
                toast.error("Erro ao carregar imagens")
            }
        } catch (error) {
            toast.error("Erro de conexão")
        } finally {
            setIsLoading(false)
        }
    }

    const handleEditClick = (image: ImageItem) => {
        setEditingImage(image)
        setEditPatientId(image.patient_id || "")
        setEditPatientName(image.patient_name || "")
        setEditTags(image.tags || "")
    }

    const handleSaveEdit = async () => {
        if (!editingImage) return
        setIsSaving(true)
        try {
            const response = await fetch(`/acervo/image/${editingImage.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_id: editPatientId,
                    patient_name: editPatientName,
                    tags: editTags
                })
            })

            if (response.ok) {
                const updatedImage = await response.json()
                setImages(images.map(img => img.id === editingImage.id ? updatedImage.image : img))
                setEditingImage(null)
                toast.success("Informações atualizadas")
            } else {
                toast.error("Erro ao atualizar")
            }
        } catch (error) {
            toast.error("Erro ao salvar")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("Tem certeza que deseja excluir esta imagem?")) return
        try {
            const response = await fetch(`/acervo/image/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (response.ok) {
                setImages(images.filter(img => img.id !== id))
                toast.success("Imagem excluída")
            } else {
                toast.error("Erro ao excluir")
            }
        } catch (error) {
            toast.error("Erro ao excluir")
        }
    }

    const filteredImages = images.filter(img => {
        const term = searchTerm.toLowerCase()
        return (
            (img.patient_name && img.patient_name.toLowerCase().includes(term)) ||
            (img.patient_id && img.patient_id.toLowerCase().includes(term)) ||
            (img.tags && img.tags.toLowerCase().includes(term)) ||
            (img.classification && img.classification.toLowerCase().includes(term))
        )
    })

    const backendUrl = "http://localhost:5000"

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-3xl font-bold">Acervo de Imagens</h1>
                </div>
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por paciente, ID ou tags..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-20">Carregando...</div>
            ) : filteredImages.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    Nenhuma imagem encontrada no acervo.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredImages.map(image => (
                        <Card key={image.id} className="overflow-hidden">
                            <CardHeader className="p-0">
                                <AspectRatio ratio={4 / 3}>
                                    <img
                                        src={`${backendUrl}${image.filename}`}
                                        alt={image.original_filename}
                                        className="object-cover w-full h-full"
                                    />
                                </AspectRatio>
                            </CardHeader>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-lg">{image.patient_name || "Paciente Não Identificado"}</h3>
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                            <User className="h-3 w-3" /> ID: {image.patient_id || "N/A"}
                                        </p>
                                    </div>
                                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${image.classification?.includes("4") || image.classification?.includes("5")
                                            ? "bg-red-100 text-red-800"
                                            : "bg-green-100 text-green-800"
                                        }`}>
                                        {image.classification || "Não classificado"}
                                    </div>
                                </div>
                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Tag className="h-3 w-3" /> {image.tags || "Sem tags"}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> {new Date(image.created_at).toLocaleDateString()}
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 pt-0 flex justify-end gap-2">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm" onClick={() => handleEditClick(image)}>
                                            <Edit className="h-4 w-4 mr-1" /> Editar
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Editar Informações</DialogTitle>
                                            <DialogDescription>Atualize os dados do paciente e tags.</DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="space-y-2">
                                                <Label>Nome do Paciente</Label>
                                                <Input value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>ID do Paciente</Label>
                                                <Input value={editPatientId} onChange={(e) => setEditPatientId(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Tags (separadas por vírgula)</Label>
                                                <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Ex: denso, calcificação" />
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setEditingImage(null)}>Cancelar</Button>
                                            <Button onClick={handleSaveEdit} disabled={isSaving}>
                                                {isSaving ? "Salvando..." : "Salvar"}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                                <Button variant="destructive" size="sm" onClick={() => handleDelete(image.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
