/**
 * Microphone level analysis, used for the lobby's input meter and for
 * active-speaker detection.
 *
 * Detection runs locally and the result is broadcast as presence state. Doing
 * it per-client is both cheaper than server-side analysis and more accurate,
 * since the local signal is pre-encode.
 */
export class AudioLevelMonitor {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private raf: number | null = null
  private data: Uint8Array<ArrayBuffer> | null = null

  /** Consecutive frames above threshold before we call it speech. Debouncing
   *  both edges stops the speaking ring from flickering on plosives. */
  private aboveFrames = 0
  private belowFrames = 0
  private speaking = false

  constructor(
    private readonly onLevel: (level: number) => void,
    private readonly onSpeakingChange?: (speaking: boolean) => void,
    private readonly threshold = 0.055,
  ) {}

  start(stream: MediaStream): void {
    this.stop()
    if (stream.getAudioTracks().length === 0) return

    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.context = new Ctor()
      this.source = this.context.createMediaStreamSource(stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.6
      this.source.connect(this.analyser)
      this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))
      this.tick()
    } catch (err) {
      console.warn("[audio] level monitor unavailable", err)
      this.stop()
    }
  }

  private tick = () => {
    if (!this.analyser || !this.data) return

    this.analyser.getByteTimeDomainData(this.data)

    // RMS around the 128 midpoint of unsigned 8-bit PCM.
    let sum = 0
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128
      sum += v * v
    }
    const level = Math.sqrt(sum / this.data.length)

    this.onLevel(Math.min(1, level * 3))

    if (this.onSpeakingChange) {
      if (level > this.threshold) {
        this.aboveFrames += 1
        this.belowFrames = 0
      } else {
        this.belowFrames += 1
        this.aboveFrames = 0
      }

      // ~3 frames (50ms) to start, ~36 frames (600ms) to stop: quick to light
      // up, slow to drop, which matches how people perceive turn-taking.
      if (!this.speaking && this.aboveFrames > 3) {
        this.speaking = true
        this.onSpeakingChange(true)
      } else if (this.speaking && this.belowFrames > 36) {
        this.speaking = false
        this.onSpeakingChange(false)
      }
    }

    this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.source?.disconnect()
    this.analyser?.disconnect()
    void this.context?.close().catch(() => {})

    this.context = null
    this.analyser = null
    this.source = null
    this.data = null
    this.aboveFrames = 0
    this.belowFrames = 0

    if (this.speaking) {
      this.speaking = false
      this.onSpeakingChange?.(false)
    }
  }
}
