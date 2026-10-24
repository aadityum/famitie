# FamiTie

A cross-platform (Android + iOS, phone + tablet) family safety app for elderly or ill family members. Provides:

- **SOS button** — rings all family devices simultaneously, auto-connects a live call on answer, shares precise location.
- **"Come for a sec" button** — low-urgency call, same ring mechanism, softer UI treatment.
- **Walkie-talkie** — press-and-hold voice messaging (PTT) for everyday communication.
- **Location sharing & tracking** — user-toggleable continuous background location, plus automatic location share on SOS.
- **Transcript** (planned) — speech-to-text log of PTT messages.

## Stack

- React + Vite + TypeScript + Tailwind CSS (UI)
- Capacitor (native shell for Android + iOS, one codebase)
- Supabase (auth, database, realtime presence/location sync)
- VoIP/calling SDK (TBD — Agora / Twilio / raw WebRTC)

## Documentation

- [`docs/WORKSPACE_SETUP.md`](docs/WORKSPACE_SETUP.md) — setting up your dev machines (Windows + Mac)
- [`docs/BUILD.md`](docs/BUILD.md) — building for Android and iOS, phone and tablet
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — releasing to Play Store and App Store
- [`docs/TESTING.md`](docs/TESTING.md) — testing with two or more users

## Quick start (Mac)

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + anon key
npm run dev                 # browser preview

# native shells (first time only)
npm install @capacitor/ios @capacitor/android
npm run build
npx cap add ios
npx cap add android

# after any web change
npm run build && npx cap sync
npx cap open ios            # Xcode: pick a simulator, Cmd+R
npx cap open android        # Android Studio
```

Database: paste and run `supabase/migrations/0001_initial_schema.sql`, `0002_auth_and_circles.sql`, then `0003_admin_chat_presence.sql`, then `0004_settings_voice_account.sql`, in that order, in the Supabase SQL Editor. See [`docs/TESTING.md`](docs/TESTING.md) for the full backend setup and a script for testing with several users.

The bundle ID in `capacitor.config.ts` (`com.adibotz.famitie`) is a placeholder until the name clears the trademark and domain checks. Change it before registering the app with Apple or Google.

## Status

Phase one in progress.

Working while the app is open: sign-up and sign-in, family circles with invite codes and roles (elder or family), online presence, "Come for a sec" and SOS alerts that ring every other member live (first to answer stops the ringing for the rest), hold-to-talk voice clips between members (the sender can delete a clip for everyone), saved text chat for people who can't talk, a list of recent SOS and "Come for a sec" calls showing who answered (kept for a time each person chooses, up to 24 hours), voice recordings that are kept 30 minutes by default and 6 hours at most, password reset by emailed code and password change, an app lock using the phone's screen lock or a PIN (alerts still ring through it), account deletion, one admin per circle who passes on automatically when they leave (with leave, remove, make-admin and inactive-member tags), live location sharing that stays on until the user switches it off (and keeps updating in the background on the phone apps), a 3-second cancel window on alerts, and a responsive phone and tablet layout. The database security rules were tested locally with several users.

Not built yet: waking a locked or closed phone (push notifications, CallKit, Android foreground service), live two-way calls, background location in a plain browser, speech-to-text transcripts, multiple circles per person, and the Apple Watch and Wear OS apps. The name FamiTie is a working name until the trademark and domain checks are done.
