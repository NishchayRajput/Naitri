import React from "react"
import { Card } from "@/components/ui/card"
import { VideoOff, User } from "lucide-react"

export default function VideoTile({
  videoRef,
  label,
  muted = false,
  isCamOn = true,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  label: string
  muted?: boolean
  isCamOn?: boolean
}) {
  return (
    <Card className="relative overflow-hidden shadow-2xl border-blue-200/50 dark:border-blue-800/50 hover:shadow-blue-400/30 dark:hover:shadow-blue-700/30 transition-all duration-500 group hover:scale-[1.02]">
      <div className="relative aspect-video bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-cover"
        />
        
        {/* Camera Off Overlay */}
        {!isCamOn && (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-950 flex items-center justify-center animate-fade-in">
            <div className="text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-blue-800/60 to-indigo-800/60 p-8 rounded-full mb-4 inline-block backdrop-blur-sm border border-blue-400/30">
                  <User className="w-20 h-20 text-blue-200" />
                </div>
              </div>
              <p className="text-blue-200 text-base font-semibold tracking-wide">Camera Off</p>
            </div>
          </div>
        )}
        
        {/* Label */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-5">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 rounded-full backdrop-blur-md shadow-lg border border-blue-400/30">
              {label}
            </span>
            {!isCamOn && (
              <div className="bg-red-500/90 p-2 rounded-full backdrop-blur-sm animate-pulse">
                <VideoOff className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Hover Effect Border */}
        <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all duration-300 pointer-events-none rounded-lg"></div>
      </div>
    </Card>
  )
}
