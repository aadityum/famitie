/** Repeating ring tone for an incoming alert. Returns a function that stops it. */
export function startRing(urgent: boolean): () => void {
  let ctx: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  try {
    ctx = new AudioContext()
    const beep = () => {
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = urgent ? 880 : 660
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.45)
      navigator.vibrate?.(urgent ? [300, 150, 300] : [200])
    }
    beep()
    timer = setInterval(beep, urgent ? 900 : 1500)
  } catch {
    /* audio may be blocked until the user interacts: the visual alert still shows */
  }
  return () => {
    if (timer) clearInterval(timer)
    void ctx?.close()
  }
}
