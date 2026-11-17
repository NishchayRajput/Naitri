import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/AuthContext"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Naitri — meetings that feel close",
  description:
    "Fast, open video meetings. HD video, screen sharing and chat, powered by a selective forwarding unit written in Go.",
}

export const viewport: Viewport = {
  // The meeting UI is dark-only by design, so the browser chrome should match.
  themeColor: "#17171d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // A meeting is a full-screen app; pinch-zoom on the control bar is a misfire.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
