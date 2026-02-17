"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
                    <div className="flex justify-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => toast.info("Login com Google em breve")}>
                            <Mail className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => toast.info("Login com Apple em breve")}>
                            <Cloud className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => toast.info("Login com GitHub em breve")}>
                            <Github className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => toast.info("Login com Outlook em breve")}>
                            <Monitor className="h-4 w-4" />
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
        </div>
    )
}
