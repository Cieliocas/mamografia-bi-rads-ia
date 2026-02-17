"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { BrainCircuit, Github, Mail, Cloud, Monitor, HelpCircle, Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react"
// Using Monitor for Outlook/Microsoft as closest generic, Cloud for iCloud.

export default function LoginPage() {
    const [isRegistering, setIsRegistering] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form State
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [email, setEmail] = useState("")
    const [fullName, setFullName] = useState("")
    const [phone, setPhone] = useState("")
    const [role, setRole] = useState("usuario_comum")
    const [showPassword, setShowPassword] = useState(false)
    const [capsLockActive, setCapsLockActive] = useState(false)

    const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.getModifierState("CapsLock")) {
            setCapsLockActive(true)
        } else {
            setCapsLockActive(false)
        }
    }

    const { login } = useAuth()

    const toggleMode = () => {
        setIsRegistering(!isRegistering)
        // Clear sensitive fields
        setUsername("")
        setPassword("")
        setConfirmPassword("")
        setEmail("")
        setFullName("")
        setPhone("")
        setRole("usuario_comum")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        if (isRegistering && password !== confirmPassword) {
            toast.error("As senhas não coincidem")
            setIsSubmitting(false)
            return
        }

        const endpoint = isRegistering ? "/auth/register" : "/auth/login"

        const payload = isRegistering ? {
            username, password, email, full_name: fullName, phone, role
        } : {
            username, password
        }

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            const data = await response.json()

            if (!response.ok) {
                // Throw the specific message from backend
                throw new Error(data.msg || "Erro na autenticacao")
            }

            if (isRegistering) {
                toggleMode() // Switch back to login
                toast.success("Conta criada! Verifique seu email (console) para ativar.")
            } else {
                // data.user comes from backend now
                login(data.access_token, data.user)
            }
        } catch (error) {
            if (error instanceof Error) {
                toast.error(error.message)
            } else {
                toast.error("Erro desconhecido")
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 relative">
            <Button variant="ghost" size="icon" className="absolute bottom-4 right-4 text-muted-foreground hover:text-foreground" title="Ajuda">
                <HelpCircle className="h-5 w-5" />
            </Button>
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                            <BrainCircuit className="h-6 w-6 text-primary-foreground" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">MammoAnnot AI</CardTitle>
                    <CardDescription>
                        {isRegistering ? "Crie sua conta profissional" : "Entre para acessar a workstation"}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <Button variant="outline" className="w-full" onClick={() => toast.info("Login com Google em breve")}>
                            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg> Google
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => toast.info("Login com Apple em breve")}>
                            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="apple" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"></path></svg> Apple
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => toast.info("Login com Microsoft em breve")}>
                            <Monitor className="mr-2 h-4 w-4" /> Microsoft
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => toast.info("Login com GitHub em breve")}>
                            <Github className="mr-2 h-4 w-4" /> GitHub
                        </Button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Ou continue com</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isRegistering && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Nome Completo</Label>
                                    <Input
                                        id="fullName"
                                        placeholder="Ex: João da Silva"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Telefone</Label>
                                        <Input
                                            id="phone"
                                            placeholder="(00) 0 0000-0000"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="role">Função</Label>
                                        <Select value={role} onValueChange={setRole}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="radiologista">Radiologista</SelectItem>
                                                <SelectItem value="medico">Médico</SelectItem>
                                                <SelectItem value="usuario_comum">Outro</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="username">Usuário</Label>
                            <Input
                                id="username"
                                placeholder="Digite seu usuário"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Senha</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyDown={checkCapsLock}
                                    onBlur={() => setCapsLockActive(false)}
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="sr-only">
                                        {showPassword ? "Ocultar senha" : "Mostrar senha"}
                                    </span>
                                </Button>
                            </div>
                            {capsLockActive && (
                                <p className="text-xs text-yellow-600 font-medium flex items-center mt-1">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> Caps Lock ativado
                                </p>
                            )}
                        </div>

                        {isRegistering && (
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        )}
                        {isRegistering && (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="terms"
                                    required
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <Label htmlFor="terms" className="text-sm font-normal">
                                    Aceito os <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="link" className="p-0 h-auto font-normal underline" type="button">termos de uso</Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>Termos de Uso e Política de Privacidade</DialogTitle>
                                                <DialogDescription>
                                                    Por favor, leia atentamente os termos antes de prosseguir.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 text-sm text-muted-foreground">
                                                <p><strong>1. Introdução</strong><br />Bem-vindo ao MammoAnnot AI. Ao utilizar nossa plataforma, você concorda com estes termos.</p>
                                                <p><strong>2. Uso da Ferramenta</strong><br />Esta ferramenta é destinada ao auxílio no diagnóstico médico e não substitui a avaliação clínica profissional.</p>
                                                <p><strong>3. Privacidade de Dados</strong><br />Respeitamos a LGPD. Seus dados e imagens são processados de forma segura e confidencial.</p>
                                                <p><strong>4. Responsabilidades</strong><br />O usuário é responsável pela veracidade das informações inseridas e pelo uso ético da plataforma.</p>
                                                <p>Declaro que li e concordo com os termos acima descritos.</p>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </Label>
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processando...
                                </>
                            ) : (
                                isRegistering ? "Criar Conta" : "Entrar"
                            )}
                        </Button>
                    </form>
                </CardContent>

                <CardFooter className="flex justify-center">
                    <Button
                        variant="link"
                        onClick={toggleMode}
                    >
                        {isRegistering ? "Já tem conta? Entre aqui" : "Não tem conta? Cadastre-se"}
                    </Button>
                </CardFooter>
            </Card>
        </div >
    )
}
