import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, PhoneOff } from "lucide-react"

export default function Controls({
  onToggleMic,
  onToggleCam,
  onShareScreen,
  onStopShare,
  onLeave,
  isMicOn = true,
  isCamOn = true,
  isSharing = false,
}: {
  onToggleMic: () => void
  onToggleCam: () => void
  onShareScreen: () => void
  onStopShare: () => void
  onLeave: () => void
  isMicOn?: boolean
  isCamOn?: boolean
  isSharing?: boolean
}) {
  return (
    <Card className="shadow-2xl border-blue-200/50 dark:border-blue-800/50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl relative overflow-hidden animate-slide-up">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5"></div>
      <div className="p-8 relative z-10">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {/* Microphone */}
          <div className="relative">
            <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${isMicOn ? 'bg-blue-500 animate-pulse' : 'bg-red-500'}`}></div>
            <Button
              onClick={onToggleMic}
              size="lg"
              variant={isMicOn ? "default" : "destructive"}
              className={`relative w-16 h-16 rounded-full ${
                isMicOn 
                  ? "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/50" 
                  : "bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-500/50"
              } shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95`}
            >
              {isMicOn ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
            </Button>
          </div>

          {/* Camera */}
          <div className="relative">
            <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${isCamOn ? 'bg-blue-500 animate-pulse' : 'bg-red-500'}`}></div>
            <Button
              onClick={onToggleCam}
              size="lg"
              variant={isCamOn ? "default" : "destructive"}
              className={`relative w-16 h-16 rounded-full ${
                isCamOn 
                  ? "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/50" 
                  : "bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-500/50"
              } shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95`}
            >
              {isCamOn ? <Video className="h-7 w-7" /> : <VideoOff className="h-7 w-7" />}
            </Button>
          </div>

          {/* Screen Share */}
          <div className="relative">
            <div className={`absolute inset-0 rounded-full blur-xl opacity-40 ${isSharing ? 'bg-blue-500 animate-pulse' : 'bg-blue-300'}`}></div>
            <Button
              onClick={isSharing ? onStopShare : onShareScreen}
              size="lg"
              variant={isSharing ? "secondary" : "outline"}
              className={`relative w-16 h-16 rounded-full ${
                isSharing 
                  ? "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-500/50" 
                  : "border-2 border-blue-400 dark:border-blue-600 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-950/30 dark:hover:to-indigo-950/30 shadow-blue-300/50"
              } shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95`}
            >
              {isSharing ? <MonitorX className="h-7 w-7" /> : <MonitorUp className="h-7 w-7" />}
            </Button>
          </div>

          {/* Leave Call */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl opacity-40 bg-red-500 animate-pulse"></div>
            <Button
              onClick={onLeave}
              size="lg"
              variant="destructive"
              className="relative w-16 h-16 rounded-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-2xl shadow-red-500/50 transition-all duration-300 hover:scale-110 active:scale-95"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </div>
        </div>

        {/* Labels */}
        <div className="flex items-center justify-center gap-6 mt-5 flex-wrap">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16 text-center">
            {isMicOn ? "Mute" : "Unmute"}
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16 text-center">
            {isCamOn ? "Stop Video" : "Start Video"}
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16 text-center">
            {isSharing ? "Stop Share" : "Share"}
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16 text-center">
            Leave
          </span>
        </div>
      </div>
    </Card>
  )
}
