"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { api, ApiError, type Room } from "@/lib/api"
import { AuthPanel } from "@/components/auth/AuthPanel"
import { HeroStage } from "@/components/landing/HeroStage"
import { Wordmark } from "@/components/shared/Logo"
import { InitialsAvatar } from "@/components/shared/Avatar"
import { cn } from "@/lib/utils"
import {
  ArrowUpRight, Check, Clock, Keyboard, Loader2, Lock, LogOut,
  MessageSquare, MonitorUp, Plus, ShieldCheck, Zap,
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
    <div className="relative min-h-dvh overflow-x-clip bg-canvas grain">
      <div className="ambient" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-5">
          <Wordmark />
          {user ? (
            <div className="flex items-center gap-2">
              <div className="glass flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5">
                <InitialsAvatar name={user.name} color={user.avatarColor} size={28} />
                <span className="hidden text-[13px] font-medium text-foreground sm:block">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
                className="glass grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <span className="hidden items-center gap-2 rounded-full border border-stroke px-3 py-1.5 text-[12px] text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-brand" />
              Open source · self-hostable
            </span>
          )}
        </header>

        {user ? <SignedInHome firstName={user.name.split(" ")[0]} /> : <SignedOutHome />}

        <footer className="mt-auto flex flex-col gap-2 border-t border-stroke py-6 text-[12px] text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>naitri · open-source video meetings</span>
          <span>Go SFU on Pion WebRTC · Next.js</span>
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Signed out                                                                */
/* ------------------------------------------------------------------------ */

function SignedOutHome() {
  return (
    <>
      <main className="grid items-center gap-12 py-10 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-6">
        <section className="animate-rise">
          <Eyebrow>HD video · screen share · chat</Eyebrow>
          <Headline>
            Face to face,
            <br />
            <Accent>from anywhere.</Accent>
          </Headline>
          <p className="mt-6 max-w-md text-pretty text-[16px] leading-relaxed text-muted-foreground">
            Crisp group calls that stay smooth as the room grows. Your device
            sends one stream; a Go media server takes care of everyone else.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "No downloads — it runs in your browser",
              "Share your screen, tab or window with audio",
              "Host controls: lock the room, remove people",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[14px] text-foreground/85">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full max-w-md justify-self-center animate-rise [animation-delay:120ms] lg:justify-self-end">
          <AuthPanel />
        </section>
      </main>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>See it in action</Eyebrow>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Built for the way <Accent>people talk.</Accent>
          </h2>
        </div>
        <HeroStage className="mx-auto mt-14 max-w-3xl" />
      </section>

      <Features />
    </>
  )
}

function Features() {
  return (
    <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-6">
      <FeatureCard
        className="lg:col-span-4"
        icon={<Zap />}
        title="One uplink, any room size"
        body="In a mesh, every extra person costs you another upload. Naitri routes media through a selective forwarding unit, so your laptop encodes once — whether there are 3 people or 25."
      >
        <SfuDiagram />
      </FeatureCard>
      <FeatureCard
        className="lg:col-span-2"
        icon={<MonitorUp />}
        title="Present anything"
        body="Share a screen, window or tab — with its audio. The stage switches to your content automatically."
      />
      <FeatureCard
        className="lg:col-span-2"
        icon={<MessageSquare />}
        title="Chat & raise hands"
        body="Side conversation and a polite queue, without talking over anyone."
      />
      <FeatureCard
        className="lg:col-span-2"
        icon={<Lock />}
        title="Host controls"
        body="Lock the meeting, remove someone, and they stay removed."
      />
      <FeatureCard
        className="lg:col-span-2"
        icon={<ShieldCheck />}
        title="Encrypted every hop"
        body="DTLS-SRTP on every leg, short-lived tokens, revocable sessions."
      />
    </section>
  )
}

function FeatureCard({
  icon, title, body, className, children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-stroke bg-surface/60 p-6 transition-colors duration-300 hover:border-stroke-strong",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-brand/0 blur-3xl transition-colors duration-500 group-hover:bg-brand/10" />
      <div className={cn("relative", children && "grid gap-6 md:grid-cols-[1fr_1fr] md:items-center")}>
        <div>
          <span className="grid size-10 place-items-center rounded-xl bg-brand/12 text-brand [&_svg]:size-[18px]">
            {icon}
          </span>
          <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Three senders, one server, three receivers: the SFU idea at a glance. */
function SfuDiagram() {
  const dots = ["from-pink-400 to-violet-600", "from-teal-300 to-cyan-700", "from-amber-300 to-orange-700"]
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-stroke bg-black/25 p-5" aria-hidden>
      <div className="flex flex-col gap-3">
        {dots.map((g) => (
          <span key={g} className={cn("size-7 rounded-full bg-gradient-to-br", g)} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-[30px]">
        {dots.map((g) => (
          <span key={g} className="h-px bg-gradient-to-r from-white/25 to-brand/70" />
        ))}
      </div>
      <div className="grid size-16 place-items-center rounded-2xl bg-brand text-[11px] font-bold tracking-wider text-brand-ink shadow-[0_0_40px_-6px_var(--brand)]">
        SFU
      </div>
      <div className="flex flex-1 flex-col gap-[30px]">
        {dots.map((g) => (
          <span key={g} className="h-px bg-gradient-to-r from-brand/70 to-white/25" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[...dots].reverse().map((g) => (
          <span key={g} className={cn("size-7 rounded-full bg-gradient-to-br opacity-80", g)} />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Signed in                                                                 */
/* ------------------------------------------------------------------------ */

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return "Up late"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function SignedInHome({ firstName }: { firstName: string }) {
  return (
    <main className="grid items-center gap-14 py-10 lg:min-h-[calc(100dvh-9rem)] lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-6">
      <section className="animate-rise">
        <Eyebrow>
          {greeting()}, {firstName}
        </Eyebrow>
        <Headline>
          Start a call
          <br />
          <Accent>in one click.</Accent>
        </Headline>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted-foreground">
          Spin up a room and share the link, or jump into one with a code.
        </p>

        <MeetingLauncher />
        <RecentMeetings />
      </section>

      <section className="hidden animate-rise [animation-delay:120ms] sm:block">
        <HeroStage className="mx-auto max-w-xl" />
      </section>
    </main>
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
    <div className="mt-9 flex max-w-xl flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={createMeeting}
        disabled={creating}
        className="group flex h-13 shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-[15px] font-semibold text-brand-ink shadow-[0_10px_40px_-10px_var(--brand)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_-10px_var(--brand)] active:translate-y-0 disabled:opacity-60"
      >
        {creating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Plus className="size-[18px] transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.5} />
            New meeting
          </>
        )}
      </button>

      <form
        onSubmit={joinMeeting}
        className="glass flex h-13 min-w-0 flex-1 items-center gap-2 rounded-2xl pl-4 pr-1.5 transition-colors focus-within:border-brand/50"
      >
        <Keyboard className="size-4 shrink-0 text-muted-foreground" />
        <label htmlFor="code" className="sr-only">
          Meeting code or link
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter a code or link"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14px] tracking-wide text-foreground outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="h-10 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-brand transition-all hover:bg-brand/10 disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
        >
          Join
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-destructive sm:hidden">
          {error}
        </p>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function RecentMeetings() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .myRooms()
      .then((r) => !cancelled && setRooms(r.filter((room) => !room.endedAt).slice(0, 4)))
      .catch(() => !cancelled && setRooms([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (rooms === null) {
    return (
      <div className="mt-10 max-w-xl space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-white/4" />
        ))}
      </div>
    )
  }
  if (rooms.length === 0) return null

  return (
    <div className="mt-10 max-w-xl">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        <Clock className="size-3.5" />
        Your recent rooms
      </h2>
      <ul className="space-y-2">
        {rooms.map((room) => (
          <li key={room.code}>
            <button
              type="button"
              onClick={() => router.push(`/room/${room.code}`)}
              className="group flex w-full items-center gap-3.5 rounded-2xl border border-stroke bg-surface/50 px-4 py-3 text-left transition-all duration-200 hover:border-stroke-strong hover:bg-surface"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/6 text-[13px] font-semibold text-foreground/80">
                {room.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[14px] font-medium text-foreground">
                  {room.name}
                  {room.locked && <Lock className="size-3 text-hand" aria-label="Locked" />}
                </span>
                <span className="font-mono text-[12px] text-muted-foreground">
                  {room.code} · {timeAgo(room.createdAt)}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Typography helpers                                                        */
/* ------------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/4 px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
      <span className="size-1.5 animate-blink rounded-full bg-brand" />
      {children}
    </span>
  )
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-6 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[76px]">
      {children}
    </h1>
  )
}

/** Serif italic accent words. Serif runs visually small, so it is bumped up. */
function Accent({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-signal pr-1 font-display text-[1.12em] font-normal italic tracking-[-0.01em]">
      {children}
    </span>
  )
}
