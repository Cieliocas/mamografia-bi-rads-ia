"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface User {
  id: number
  username: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, username: string) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check local storage on mount
    const storedToken = localStorage.getItem("token")
    const storedUsername = localStorage.getItem("username")

    if (storedToken && storedUsername) {
      setToken(storedToken)
      setUser({ id: 0, username: storedUsername }) // We don't have ID here easily without 'me' call
    }
    setIsLoading(false)
  }, [])

  const login = (newToken: string, newUsername: string) => {
    localStorage.setItem("token", newToken)
    localStorage.setItem("username", newUsername)
    setToken(newToken)
    setUser({ id: 0, username: newUsername })
    toast.success("Login realizado com sucesso")
    router.push("/")
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("username")
    setToken(null)
    setUser(null)
    toast.info("Logout realizado")
    router.push("/login")
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
