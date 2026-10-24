import { supabase } from './supabase'
import { stopSharingEverywhere } from './locationSync'
import { clearLock } from './applock'

const need = () => {
  if (!supabase) throw new Error('Backend not configured')
  return supabase
}

const friendly = (e: { message?: string } | null | undefined, fallback: string) => {
  const m = e?.message ?? ''
  if (/expired|invalid/i.test(m)) return 'That code is wrong or has expired. Ask for a new one.'
  if (/rate limit|too many|seconds/i.test(m)) return 'Too many tries. Please wait a minute and try again.'
  if (/same password|different from the old/i.test(m)) return 'Choose a password you have not used before.'
  if (/password/i.test(m) && /characters|weak|short/i.test(m)) return 'That password is too weak. Use at least 6 characters.'
  return m || fallback
}

/** Step 1 of "forgot password": email a one-time code. */
export async function requestPasswordReset(email: string) {
  const { error } = await need().auth.resetPasswordForEmail(email.trim())
  if (error) throw new Error(friendly(error, 'Could not send the code'))
}

/** Step 2: check the code from the email, then set the new password (this also signs the person in). */
export async function confirmPasswordReset(email: string, code: string, newPassword: string) {
  const client = need()
  const { error: e1 } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' })
  if (e1) throw new Error(friendly(e1, 'That code did not work'))
  const { error: e2 } = await client.auth.updateUser({ password: newPassword })
  if (e2) throw new Error(friendly(e2, 'Could not set the new password'))
}

/** Change password while signed in. The current password is checked first. */
export async function changePassword(email: string, current: string, next: string) {
  const client = need()
  const { error: e1 } = await client.auth.signInWithPassword({ email, password: current })
  if (e1) throw new Error('Your current password is not right.')
  const { error: e2 } = await client.auth.updateUser({ password: next })
  if (e2) throw new Error(friendly(e2, 'Could not change the password'))
}

/** Permanently deletes the account and all of the person's data, then signs this device out. */
export async function deleteAccount(userId: string) {
  const client = need()
  try {
    await stopSharingEverywhere(userId)
  } catch {
    /* the account is about to be deleted anyway */
  }
  const { error } = await client.rpc('delete_my_account')
  if (error) throw new Error(friendly(error, 'Could not delete the account. Make sure migration 0004 has been run.'))
  clearLock(userId)
  await client.auth.signOut({ scope: 'local' }).catch(() => {})
}
