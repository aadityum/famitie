# Testing with more than one user

FamiTie is a communication app, so it only proves itself with at least two people signed in on two separate devices (or browser profiles).

## One-time backend setup (Supabase dashboard)

1. Create a project at supabase.com.
2. **SQL Editor**: run `supabase/migrations/0001_initial_schema.sql`, then `0002_auth_and_circles.sql`, in that order.
3. **Authentication → Providers → Email**: switch **Confirm email** OFF while testing. Otherwise every test account has to click an email link before it can sign in.
4. **Project Settings → API**: copy the Project URL and the `anon` public key into `.env` (copy `.env.example`).
5. `npm install && npm run dev`

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

## What is not built yet (so don't expect it)

- **Waking a locked or closed phone.** Alerts, voice and location only work while FamiTie is open on both phones. Making a closed app ring needs push notifications (FCM and APNs, plus CallKit on iOS and a foreground service on Android).
- **Live two-way calls.** "Hold to talk" sends short voice clips (up to 15 seconds), not a live stream.
- **Location while the app is closed.** Sharing stops when the app is closed.
- **Unanswered alerts.** An alert nobody answers keeps ringing until someone answers or dismisses it. There is no "missed" status or retry yet.
- **More than one circle per person.** The first circle is used.
- **Written transcripts.** Messages show as voice clips with a Play button; speech-to-text comes later.

## On real phones

Build the native shells (see `BUILD.md`) and install on an iPhone and an Android phone, signed in as two different users. Real phones are the only way to test background behaviour, the microphone prompt, and sound on the ringer.
