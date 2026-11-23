import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
// Display serif, used sparingly (italic) for headline accents.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: "Naitri — meetings that feel close",
  description:
    "Fast, open video meetings. HD video, screen sharing and chat, powered by a selective forwarding unit written in Go.",
}

export const viewport: Viewport = {
  // The meeting UI is dark-only by design, so the browser chrome should match.
  themeColor: "#0e0f12",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // A meeting is a full-screen app; pinch-zoom on the control bar is a misfire.
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variables must live on <html>: Tailwind resolves the base font
    // family there, so defining them only on <body> silently falls back to the
    // system font.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
