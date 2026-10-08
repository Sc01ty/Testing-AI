import { mic } from '../audio/mic'
export class RoomVoice {
  private pc!: RTCPeerConnection
  private readonly nonce = crypto.randomUUID()
  private remoteNonce: string | null = null
  private candidates: RTCIceCandidateInit[] = []
  private offerSent = false
  private chain = Promise.resolve()
  private hello: ReturnType<typeof setInterval>
  private closed = false
  private output = new Audio()
  constructor(
    private host: boolean,
    private send: (message: Record<string, unknown>) => Promise<void>,
    private status: (s: string) => void,
  ) {
    this.output.autoplay = true
    this.makePeer()
    this.greet()
    this.hello = setInterval(() => {
      if (this.pc.connectionState !== 'connected') this.greet()
    }, 2500)
  }
  private greet() {
    void this.send({ type: 'hello', from: this.nonce }).catch(() =>
      this.status('Reconnecting to lobby…'),
    )
  }
  private makePeer() {
    this.pc?.close()
    this.candidates = []
    this.offerSent = false
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    })
    for (const track of mic.mediaStream?.getAudioTracks() ?? [])
      this.pc.addTrack(track, mic.mediaStream!)
    this.pc.onicecandidate = (e) => {
      if (e.candidate)
        void this.send({ type: 'ice', from: this.nonce, candidate: e.candidate.toJSON() }).catch(
          () => this.status('Voice connection interrupted'),
        )
    }
    this.pc.ontrack = (e) => {
      this.output.srcObject = e.streams[0] ?? new MediaStream([e.track])
      void this.output.play().catch(() => this.status('Tap Enable voice to hear your teammate'))
    }
    this.pc.onconnectionstatechange = () => {
      if (!this.closed) this.status(this.pc.connectionState)
    }
    this.status('connecting')
  }
  receive(messages: Record<string, unknown>[]) {
    for (const message of messages)
      this.chain = this.chain
        .then(() => this.handle(message))
        .catch((e) => this.status(`Voice: ${e instanceof Error ? e.message : 'connection failed'}`))
  }
  private async handle(m: Record<string, unknown>) {
    if (this.closed) return
    if (m.type === 'hello') {
      if (this.remoteNonce !== m.from) {
        this.remoteNonce = String(m.from)
        this.makePeer()
        this.greet()
      }
      if (this.host && !this.offerSent) {
        this.offerSent = true
        await this.pc.setLocalDescription(await this.pc.createOffer())
        await this.send({
          type: 'offer',
          from: this.nonce,
          description: this.pc.localDescription?.toJSON(),
        })
      }
      return
    }
    if (this.remoteNonce && this.remoteNonce !== m.from) return
    if (m.type === 'offer' || m.type === 'answer') {
      await this.pc.setRemoteDescription(m.description as RTCSessionDescriptionInit)
      for (const candidate of this.candidates) await this.pc.addIceCandidate(candidate)
      this.candidates = []
      if (m.type === 'offer') {
        await this.pc.setLocalDescription(await this.pc.createAnswer())
        await this.send({
          type: 'answer',
          from: this.nonce,
          description: this.pc.localDescription?.toJSON(),
        })
      }
    } else if (m.type === 'ice') {
      const c = m.candidate as RTCIceCandidateInit
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(c)
      else this.candidates.push(c)
    }
  }
  unmute() {
    void this.output.play().catch(() => this.status('Allow audio playback in this browser'))
  }
  setMuted(value: boolean) {
    this.output.muted = value
  }
  close() {
    this.closed = true
    clearInterval(this.hello)
    this.pc.close()
    this.output.pause()
    this.output.srcObject = null
  }
}
