"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, User } from "lucide-react"

type Mode = "login" | "signup"

export function AuthPanel() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="glass lit-edge w-full rounded-[28px] p-7 shadow-float sm:p-8">
      <div className="mb-7">
        <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {mode === "login" ? "Sign in to start or join a meeting." : "It takes ten seconds. No credit card."}
        </p>
      </div>

      {/* Segmented control with a sliding thumb. */}
      <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-black/35 p-1" role="tablist">
        <span
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-surface-high shadow-sm ring-1 ring-stroke transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            mode === "signup" && "translate-x-full",
          )}
          aria-hidden
        />
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              "relative z-10 rounded-xl px-4 py-2.5 text-[14px] font-medium transition-colors duration-200",
              mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "login" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3.5">
        {mode === "signup" && (
          <Field
            label="Name"
            icon={<User />}
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
          icon={<Mail />}
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
        />

        <Field
          label="Password"
          icon={<LockKeyhole />}
          value={password}
          onChange={setPassword}
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[13px] text-destructive animate-pop"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-brand-ink shadow-[0_10px_40px_-12px_var(--brand)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-12px_var(--brand)] active:translate-y-0 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {mode === "login" ? "Sign in" : "Create account"}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  icon,
  value,
  onChange,
  trailing,
  ...props
}: {
  label: string
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
  trailing?: React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = `field-${label.toLowerCase()}`

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex h-12 items-center gap-2.5 rounded-2xl border border-stroke bg-black/30 pl-3.5 pr-2 transition-all duration-150 focus-within:border-brand/60 focus-within:bg-black/40 focus-within:shadow-[0_0_0_4px_var(--brand-soft)]">
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground/55"
          {...props}
        />
        {trailing}
      </div>
    </div>
  )
}
