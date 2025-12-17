"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Video, Users, Shield, Sparkles } from "lucide-react"

export default function Home() {
  const [roomId, setRoomId] = useState("")
  const router = useRouter()

  const joinRoom = () => {
    if (!roomId.trim()) return
    router.push(`/room/${roomId}`)
  }

  const createRoom = () => {
    const newRoomId = crypto.randomUUID().slice(0, 8)
    router.push(`/room/${newRoomId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-300/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6 animate-float">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl blur-xl opacity-50 animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 p-5 rounded-2xl shadow-2xl shadow-blue-500/40">
                <Video className="w-14 h-14 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-7xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 bg-clip-text text-transparent mb-4 animate-fade-in">
            Naitri Video
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto animate-fade-in-up">
            Connect with anyone, anywhere. Experience crystal-clear video calls with professional simplicity.
          </p>
        </div>

        {/* Main Card */}
        <div className="max-w-2xl mx-auto animate-scale-in">
          <Card className="shadow-2xl border-blue-200/50 dark:border-blue-800/50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5"></div>
            <CardHeader className="text-center relative z-10">
              <CardTitle className="text-4xl font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Join a Video Room
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Enter a room ID to join an existing call or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 relative z-10">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter Room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                    className="flex-1 h-14 text-lg border-2 border-blue-300/50 dark:border-blue-700/50 focus:ring-2 focus:ring-blue-500 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm transition-all"
                  />
                  <Button 
                    onClick={joinRoom} 
                    disabled={!roomId.trim()}
                    className="h-14 px-10 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 font-semibold"
                  >
                    Join Room
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300 dark:border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">Or</span>
                  </div>
                </div>

                <Button 
                  onClick={createRoom} 
                  variant="outline"
                  className="w-full h-14 text-lg border-2 border-blue-300 dark:border-blue-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-950/30 dark:hover:to-indigo-950/30 text-blue-700 dark:text-blue-400 font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                >
                  <Sparkles className="mr-2 h-5 w-5 animate-pulse" />
                  Create New Room
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="text-center border-blue-100/50 dark:border-blue-900/50 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-500 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md group hover:scale-105 hover:-translate-y-2">
              <CardContent className="pt-6">
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Video className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">HD Quality</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Crystal-clear video and audio for the best experience
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-indigo-100/50 dark:border-indigo-900/50 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-500 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md group hover:scale-105 hover:-translate-y-2">
              <CardContent className="pt-6">
                <div className="bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Users className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">Easy to Use</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Join rooms instantly with just a room ID
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-blue-100/50 dark:border-blue-900/50 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-500 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md group hover:scale-105 hover:-translate-y-2">
              <CardContent className="pt-6">
                <div className="bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">Secure</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  End-to-end encrypted connections
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
