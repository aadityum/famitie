# Deployment Guide

## Android — Google Play Store

1. Generate a signed release build:
   ```
   npx cap sync android
   ```
   Then in Android Studio: **Build > Generate Signed Bundle / APK**, choose Android App Bundle (`.aab`), create/use a keystore (keep this file and its password safe — losing it means you can't update the app under the same listing again).
2. Create a Google Play Developer account (one-time fee) at play.google.com/console.
3. Create a new app listing, fill in store listing details (description, screenshots for both phone and tablet form factors, privacy policy URL — required, especially given location + calling permissions).
4. Complete the Data Safety section accurately: this app collects precise location, and shares it with other users (family members) — declare this honestly, Google checks.
5. Upload the `.aab` to a testing track first (Internal testing → Closed testing) before Production.
6. Submit for review.

## iOS — Apple App Store

1. In Xcode: **Product > Archive**, then use the Organizer to upload to App Store Connect.
2. Requires an active Apple Developer Program membership (annual fee).
3. In App Store Connect, create the app listing: description, screenshots (iPhone and iPad sizes both required), privacy policy URL, and Privacy Nutrition Label — must accurately declare location data collection and its use (shared with family members, not third parties, etc.).
4. Because this app requests "Always" location access and background modes, expect Apple's review to ask for justification — have a short explanation ready (elder safety / emergency contact use case) and consider a demo video or account for the reviewer showing the SOS flow.
5. Submit for review via TestFlight first (recommended) to catch issues before a public submission.

## Environment/secrets

- Supabase URL/anon key and any VoIP SDK API keys should be stored as environment variables, never committed to Git.
- Use separate Supabase projects (or at least separate keys) for development vs. production if possible, so testing doesn't touch real family data.

## Release checklist

- [ ] Privacy policy published and linked (mandatory given location + calling data)
- [ ] Data Safety (Android) / Privacy Nutrition Label (iOS) filled out accurately
- [ ] Tested on real devices for both platforms, phone and tablet
- [ ] Keystore (Android) backed up somewhere safe outside the repo
- [ ] App Store / Play Store screenshots prepared for all four form factors
