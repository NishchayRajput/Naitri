"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ArrowRight, Loader2, AlertCircle } from "lucide-react"

type Mode = "login" | "signup"

export function AuthPanel() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === "login") await login(email, password)
      else await signup(name, email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <div className="glass lit-edge w-full rounded-2xl p-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
              mode === m
                ? "bg-surface-high text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <Field
            label="Name"
            value={name}
            onChange={setName}
            type="text"
            autoComplete="name"
            placeholder="Ada Lovelace"
            required
          />
        )}

        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
        />

        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          hint={mode === "signup" ? "Use 8 characters or more." : undefined}
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand text-sm font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {mode === "login" ? "Sign in" : "Create account"}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  hint,
  ...props
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = `field-${label.toLowerCase()}`

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-stroke bg-black/25 px-3.5 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus:border-brand/60 focus:bg-black/35"
        {...props}
      />
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
