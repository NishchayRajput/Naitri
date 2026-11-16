"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { api, setSessionExpiredHandler, tokenStore, type User } from "@/lib/api"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Seeded from storage during the first client render so a returning user
  // does not see a flash of the signed-out screen.
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const cached = tokenStore.user
    if (cached) setUser(cached)

    // Revalidate against the server: the cached user may be stale, and the
    // refresh token may have been revoked or expired.
    void (async () => {
      if (!tokenStore.access && !tokenStore.refresh) {
        if (!cancelled) setIsLoading(false)
        return
      }
      try {
        const fresh = await api.me()
        if (cancelled) return
        setUser(fresh)
        tokenStore.saveUser(fresh)
      } catch {
        if (cancelled) return
        tokenStore.clear()
        setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // A failed refresh anywhere in the app must drop the session everywhere.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null)
      router.push("/")
    })
    return () => setSessionExpiredHandler(null)
  }, [router])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password)
    tokenStore.save(result)
    setUser(result.user)
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.signup(name, email, password)
    tokenStore.save(result)
    setUser(result.user)
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    router.push("/")
  }, [router])

  const value = useMemo(
    () => ({ user, isLoading, login, signup, logout }),
    [user, isLoading, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
