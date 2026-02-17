"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GlobalLoader } from "@/components/ui/global-loader"

interface User {
  id: number
  username: string
  email?: string
  full_name?: string
  role?: string
  phone?: string
  profile_image?: string
  created_at?: string
  is_verified?: boolean
  image_count?: number
  providers?: {
    google: boolean
    apple: boolean
    microsoft: boolean
    github: boolean
  }
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, userData: User) => void
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
    const storedUser = localStorage.getItem("user")

    if (storedToken && storedUser) {
      setToken(storedToken)
      try {
        setUser(JSON.parse(storedUser))
      } catch (e) {
        console.error("Failed to parse user from storage", e)
      }
    }
    setIsLoading(false)
  }, [])

  const login = (newToken: string, userData: User) => {
    setIsLoading(true) // Start loading on login for smooth transition
    localStorage.setItem("token", newToken)
    localStorage.setItem("user", JSON.stringify(userData))
    setToken(newToken)
    setUser(userData)
    toast.success("Login realizado com sucesso")

    // Simulate a small delay for the transition effect
    setTimeout(() => {
      router.push("/")
      setIsLoading(false)
    }, 800)
  }

  const logout = () => {
    setIsLoading(true) // Start loading on logout
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    localStorage.removeItem("username")
    setToken(null)
    setUser(null)
    toast.info("Logout realizado")

    setTimeout(() => {
      router.push("/login")
      setIsLoading(false)
    }, 500)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {isLoading && <GlobalLoader />}
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
