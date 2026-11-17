"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { api, ApiError } from "@/lib/api"
import { AuthPanel } from "@/components/auth/AuthPanel"
import { Wordmark } from "@/components/shared/Logo"
import { InitialsAvatar } from "@/components/shared/Avatar"
import {
  ArrowRight, Loader2, LogOut, MonitorUp, MessageSquare,
  ShieldCheck, Zap, Video,
} from "lucide-react"

export default function HomePage() {
  const { user, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas grain">
      <div className="aurora" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <Wordmark />
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2.5 sm:flex">
                <InitialsAvatar name={user.name} color={user.avatarColor} size={32} />
                <div className="leading-tight">
                  <p className="text-[13px] font-medium text-foreground">{user.name}</p>
                  <p className="text-[11px] text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                className="grid size-9 place-items-center rounded-xl border border-stroke text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </header>

        <main className="flex flex-1 items-center py-12">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/4 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-live" />
                Go SFU · one uplink, any room size
              </span>

              <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                <span className="text-gradient">Meetings</span>
                <br />
                that feel close.
              </h1>

              <p className="mt-5 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">
                HD video, screen sharing and chat — routed through a selective
                forwarding unit, so your laptop sends one stream no matter how
                many people are in the room.
              </p>

              <div className="mt-9 grid max-w-md gap-3 sm:grid-cols-2">
                <Feature icon={<Zap />} title="One uplink" body="Your device encodes once, not once per person." />
                <Feature icon={<MonitorUp />} title="Present anything" body="Share a screen or tab, with audio." />
                <Feature icon={<MessageSquare />} title="Chat & hands" body="Side conversation without interrupting." />
                <Feature icon={<ShieldCheck />} title="Encrypted hops" body="DTLS-SRTP on every leg of the call." />
              </div>
            </section>

            <section className="w-full max-w-md justify-self-center lg:justify-self-end">
              {user ? <MeetingLauncher /> : <AuthPanel />}
            </section>
          </div>
        </main>

        <footer className="pt-6 text-[11px] text-muted-foreground/60">
          Naitri · open-source video meetings
        </footer>
      </div>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-stroke bg-white/3 p-3.5">
      <span className="text-brand [&_svg]:size-4">{icon}</span>
      <p className="mt-2 text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{body}</p>
    </div>
  )
}

function MeetingLauncher() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMeeting = async () => {
    setError(null)
    setCreating(true)
    try {
      const room = await api.createRoom()
      router.push(`/room/${room.code}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a meeting.")
      setCreating(false)
    }
  }

  const joinMeeting = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    // The room page resolves and normalises the code, so anything
    // code-shaped — including a pasted link — is accepted here.
    const fromLink = trimmed.split("/").pop() ?? trimmed
    router.push(`/room/${encodeURIComponent(fromLink)}`)
  }

  return (
    <div className="glass lit-edge rounded-2xl p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] animate-rise">
      <button
        type="button"
        onClick={createMeeting}
        disabled={creating}
        className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-brand text-sm font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
      >
        {creating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Video className="size-[18px]" />
            Start an instant meeting
          </>
        )}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-stroke" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">or</span>
        <span className="h-px flex-1 bg-stroke" />
      </div>

      <form onSubmit={joinMeeting} className="space-y-3">
        <label htmlFor="code" className="block text-xs font-medium text-muted-foreground">
          Join with a code
        </label>
        <div className="flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="abc-defg-hij"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-xl border border-stroke bg-black/25 px-3.5 font-mono text-sm tracking-wide text-foreground outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:border-brand/60 focus:bg-black/35"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            aria-label="Join meeting"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-stroke text-foreground transition-all hover:bg-white/8 disabled:opacity-40"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
