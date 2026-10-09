import { useState } from 'react'
import { audio } from '../../audio/AudioEngine'
import { PLACEMENT_EVENTS, rankAt } from '../../ranked/ladder'
import { useRankedProfile } from '../../ranked/profile'
import { accountStore, useAccount } from '../../social/account'
import { Button } from '../ui/ui'

/**
 * Claim a name / sign in with your recovery code / see your code again.
 * No passwords and no email: the recovery code IS the login, so it's shown
 * once, big, with a copy button, and you confirm you've kept it.
 */
export function AccountPanel({ onDone, reason }: { onDone?: () => void; reason?: string }) {
  const account = useAccount()
  const profile = useRankedProfile()
  const [mode, setMode] = useState<'claim' | 'restore'>('claim')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [reveal, setReveal] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      audio.play('save')
    } catch (e) {
      audio.play('error')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      audio.play('toggle')
    } catch {
      setCopied(false)
    }
  }

  if (fresh && account)
    return (
      <div className="account account--code">
        <span className="eyebrow">You’re {account.name}</span>
        <p>This is your recovery code. It’s the only way to get your name, rank and tracks back on another device or if this browser is cleared. Nobody can reset it for you.</p>
        <code className="account__code">{fresh}</code>
        <div className="account__row">
          <Button variant="ghost" onClick={() => void copy(fresh)}>
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          <Button variant="primary" onClick={() => (setFresh(null), onDone?.())}>
            I’ve saved it
          </Button>
        </div>
      </div>
    )

  if (account)
    return (
      <div className="account">
        <span className="eyebrow">Signed in as</span>
        <b className="account__name">{account.name}</b>
        <p className="account__sub">
          {profile.events < PLACEMENT_EVENTS ? `Placement ${profile.events}/${PLACEMENT_EVENTS}` : rankAt(profile.rp).label} · {profile.rp.toLocaleString()} RP
          {account.me?.worldRank ? ` · #${account.me.worldRank} in the world` : ''}
        </p>
        <div className="account__row">
          <Button variant="ghost" onClick={() => setReveal((r) => !r)}>
            {reveal ? 'Hide recovery code' : 'Show recovery code'}
          </Button>
          <Button variant="quiet" onClick={() => accountStore.signOut()}>
            Sign out
          </Button>
        </div>
        {reveal && (
          <div className="account__reveal">
            <code className="account__code">{account.code}</code>
            <Button variant="quiet" onClick={() => void copy(account.code)}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}
        <p className="account__fine">Signing out keeps your rank on this device but removes your name from it. You’ll need the recovery code to sign back in.</p>
      </div>
    )

  return (
    <div className="account">
      {reason && <p className="account__reason">{reason}</p>}
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={mode === 'claim'} onClick={() => (audio.play('toggle'), setMode('claim'), setError(null))}>
          Claim a name
        </button>
        <button role="tab" className="tab" aria-selected={mode === 'restore'} onClick={() => (audio.play('toggle'), setMode('restore'), setError(null))}>
          I already have one
        </button>
      </div>
      <form
        className="account__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) return
          if (mode === 'claim')
            void run(async () => {
              const c = await accountStore.claim(name)
              setFresh(c)
            })
          else void run(async () => (await accountStore.restore(name, code), onDone?.()))
        }}
      >
        <label className="field">
          <span className="field__label">
            <span className="eyebrow">Name</span>
          </span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="off" spellCheck={false} placeholder="3–20 letters or numbers" required />
        </label>
        {mode === 'restore' && (
          <label className="field">
            <span className="field__label">
              <span className="eyebrow">Recovery code</span>
            </span>
            <input className="input input--code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={19} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" required />
          </label>
        )}
        {mode === 'claim' && profile.events > 0 && (
          <p className="account__fine">
            Your {profile.events} ranked {profile.events === 1 ? 'piece' : 'pieces'} on this device come with you (imports stop at Breakout III; climb the rest online).
          </p>
        )}
        {error && (
          <p className="account__error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy || name.trim().length < 3} clickSound={null}>
          {busy ? 'One sec…' : mode === 'claim' ? 'Claim name' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
