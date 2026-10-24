# Testing with more than one user

FamiTie is a communication app, so it only proves itself with at least two people signed in on two separate devices (or browser profiles).

## One-time backend setup (Supabase dashboard)

1. Create a project at supabase.com.
2. **SQL Editor**: paste the CONTENTS of each file (not the file name) and run them in order: `0001_initial_schema.sql`, `0002_auth_and_circles.sql`, `0003_admin_chat_presence.sql`, `0004_settings_voice_account.sql`, `0005_status_modes.sql`, then `0006_end_to_end_encryption.sql`. If you set up earlier, just run the newer files now; they upgrade the existing data safely and can be run again.
3. **Authentication → Providers → Email**: switch **Confirm email** OFF while testing. Otherwise every test account has to click an email link before it can sign in.
4. **Project Settings → API**: copy the Project URL and the `anon` public key into `.env` (copy `.env.example`).
5. `npm install && npm run dev`

## One-time email setup for "Forgot password" (Supabase dashboard)

The phone app resets passwords with a short code typed into the app (no link that has to open a web page). For the email to contain the code, edit the template once:

1. **Authentication → Emails → Reset password** (the template editor).
2. Add this line to the message body: `<p>Your FamiTie reset code is: <strong>{{ .Token }}</strong></p>` and keep or remove the default link as you prefer.
3. Click **Save**.

Supabase's built-in email sender is limited to a few emails per hour and is meant for testing. Before real users, set up your own email service under **Authentication → Emails → SMTP Settings** (any provider, e.g. Resend, Brevo or Amazon SES).

## Two users on one Mac (fastest)

The session is stored per browser profile, so two tabs of the same browser share one login. Use two separate profiles instead:

- Chrome normal window as **Asha**, and a Chrome Incognito window (or a second Chrome profile, or Safari) as **Ravi**.
- Open `http://localhost:5173` in each. Use `localhost`, not your Mac's IP address: browsers only allow the microphone on `localhost` or HTTPS.

## Test script

| # | Do this | Expected |
|---|---------|----------|
| 1 | In window A, create an account (name "Asha"), choose **Start a circle**, role **Elder**, name it. | Home screen opens. Members shows Asha with an invite code. |
| 2 | In window B, create an account ("Ravi"), choose **Join with a code**, role **Family**, paste the code. | Both windows list both people. Within a few seconds both show a green dot and the centre circle says `2 online`. |
| 3 | In A, hold the centre button and speak for a couple of seconds, then release. | B hears the clip and gets a "Voice message" line with a Play button. A sees its own line. |
| 4 | In A, press **Come for a sec**. | A 3-second countdown with Cancel. After it, B gets a full-screen orange ring with a repeating tone. |
| 5 | In B, press **Answer**. | B's ring stops. A's panel changes to "Ravi answered". |
| 6 | Sign up a third user "Meera" in another profile and join the circle. Repeat step 4 from A, and have Ravi answer. | Meera's ring stops as soon as Ravi answers. |
| 7 | In A, press **SOS**. | Same as step 4 but red and with a faster tone. If location was allowed, B sees a "See their location" link. |
| 8 | In A, switch on **Share my location**. | B's Members list shows "Location · just now" next to Asha. |
| 9 | In A, switch it off. | The location link disappears from B's list within a few seconds. |
| 10 | Create a fourth account that never joined the circle. | It sees an empty set-up screen and nothing from the circle. |
| 11 | In A, look at the member list. | Asha shows an **Admin** badge. Only A sees **Make admin** and **Remove** next to other people. B and C see neither. |
| 12 | In A (admin), press **Leave circle** and confirm. | A goes back to the set-up screen. In B's window, within a few seconds, one of the remaining people now has the **Admin** badge (a Family member is chosen before the Elder). There is never a circle with no admin. |
| 13 | As the new admin, press **Remove** next to a member and confirm. | They disappear from everyone's list. The removed person's window goes back to the set-up screen. |
| 14 | As admin, press **Make admin** next to someone. | The Admin badge moves to them, and the buttons move with it. |
| 15 | Type a message in the box and press **Send**. | It appears in everyone's Messages list right away, and is still there after a page reload. |
| 16 | Delete your own message. As admin, delete someone else's. As a non-admin, check you cannot delete another person's. | Deleted messages vanish for everyone. A non-admin only sees Delete on their own messages. |
| 17 | Hold to talk to send a clip. On the clip you sent, press **Delete**. | It disappears from your list and from the other person's list. On a clip someone else sent, the button says **Remove** and hides it on your screen only. |
| 18 | Switch **Share my live location** on, then reload the page. | The switch is still on after the reload and sharing resumes by itself. The other window shows **● Live · just now**. |
| 19 | Close the tab that is sharing and look at the other window after 10+ minutes. | The pin changes from **● Live** to **Last seen · N min ago**, showing it is old. Sharing is still on until the person turns it off or signs out. |
| 20 | Press **Sign out** while sharing. | Sharing is switched off for the circle. The location link disappears from other windows. |

| 21 | On the sign-in screen, press **Forgot password?**, enter a test email and press **Email me a code**. | The screen asks for a code. An email arrives with a code (see the one-time email setup above). |
| 22 | Enter the code and a new password. | You are signed in. Sign out and back in with the new password to confirm. |
| 23 | Open **⚙ Settings → Change password** and use a wrong current password, then the right one. | Wrong current password is refused. The right one says "Password changed." |
| 24 | In **⚙ Settings**, turn **Lock FamiTie** on and choose a 4 to 6 digit PIN (a browser has no phone lock, so it uses a PIN). Reload the page. | FamiTie shows the locked screen. A wrong PIN says "Wrong PIN". 5 wrong tries pause the keypad for 30 seconds. The right PIN opens it. |
| 25 | While A is locked, have B press **SOS**. | A's lock screen is covered by the full-screen ring. A can press **Answer** without unlocking. |
| 26 | From A, send **Come for a sec**, have B answer. | In **Recent alerts** on both screens: "Come for a sec from Asha", "✓ Ravi answered · 9:43 PM (12 s after)". It stays visible for the time chosen in Settings. |
| 27 | In **⚙ Settings**, change **Show an answered alert for** to 5 minutes, then wait. | The answered alert leaves the list 5 minutes after it was answered. An alert nobody answered stays at least an hour. |
| 28 | Send a voice clip. Look under it. | It says "disappears in 30 min" (or whatever the sender chose, up to 6 hours). Reload as the other person: the clip is still there and can be played, until it expires. |
| 29 | In **⚙ Settings**, set **Keep my voice recordings for** to 5 minutes, send a clip, and wait. | The clip disappears from both screens after about 5 minutes. |
| 30 | Create a throwaway account, join the circle, then **⚙ Settings → Delete my account…**, type DELETE and confirm. | That person is signed out and cannot sign in again. Their messages and clips are gone. The circle carries on. If they were the admin, admin passes to someone else. |

**Inactive members:** a person who has not opened FamiTie for 7 days gets an amber **Inactive** tag in the list, and the admin's Remove button for them turns solid red. To try this quickly, run this in the Supabase SQL Editor, using the person's name as it appears in the app:
`update family_members set last_seen_at = now() - interval '10 days' where user_id = (select id from profiles where display_name = 'Ravi');`
Their tag appears once they are offline and the list refreshes.

## What is not built yet (so don't expect it)

- **Waking a locked or closed phone.** Alerts, voice and location only work while FamiTie is open on both phones. Making a closed app ring needs push notifications (FCM and APNs, plus CallKit on iOS and a foreground service on Android).
- **Live two-way calls.** "Hold to talk" sends short voice clips (up to 15 seconds), not a live stream.
- **Location in the background in a browser.** The phone apps keep sharing with the screen off (see `BUILD.md`), but a browser tab only shares while it is open.
- **Unanswered alerts.** An alert nobody answers keeps ringing until someone answers or dismisses it. There is no "missed" status or retry yet.
- **More than one circle per person.** The first circle is used.
- **Long-term voice history.** Voice clips are kept only for the time their sender chose (30 minutes by default, 6 hours at most), then deleted. Text chat is saved.
- **Written transcripts.** Speech-to-text of voice clips comes later.

## On real phones

Build the native shells (see `BUILD.md`) and install on an iPhone and an Android phone, signed in as two different users. Real phones are the only way to test background behaviour, the microphone prompt, and sound on the ringer.

## Status, silent mode and appear offline (update 3)

1. Tap the small status pill in the header (top right). Pick **In a meeting**, **Sleeping** or **Do not disturb**, and a duration. The other person sees the chip next to your name within a second.
2. With status set (or **Silent mode** on), have the other person tap **Come for a sec**: your screen shows it quietly, with no sound. Voice clips arrive silently in the list.
3. Have them send **SOS**: it still rings loudly (default). Turn off **SOS always rings** to test the opposite.
4. **Appear offline**: your green dot disappears for others, but you still receive alerts.
5. Turn off Wi-Fi: an amber "No internet" banner appears.

## Private messages: end-to-end encryption (update 4)

Run `0006_end_to_end_encryption.sql` first. Existing test messages stay readable; everything new is encrypted.

1. **First sign-in:** a "Save your recovery code" screen appears. Tick the box and continue. (Closing the app before that just shows it again next time.)
2. **Send** a chat message and a voice clip. In Supabase > Table Editor > `messages`, the `body` is scrambled text and `iv` / `key_version` are filled in. Same for `voice_clips.audio`.
3. **Second person** signs in, saves their code, and joins. For a moment the amber "Getting your circle's secure key" bar may show, until the first person's app is open and unlocks it for them (a few seconds).
4. **New phone / cleared browser:** sign in, choose "Enter your recovery code", and old messages return. Wrong code: "doesn't match". "Start fresh" makes a new key and old messages stay unreadable.
5. **Removing a member** starts a new circle key. They cannot read anything sent afterwards, even with an old copy of the app.
6. **Settings > Private messages > Make a new recovery code** replaces the old one.
7. **Plain-text sending is refused** by the database for new rows (check constraints).
8. Optional: Supabase > Database > Extensions > enable `pg_cron`, then run 0006 again to schedule the 10-minute purge of expired clips.
