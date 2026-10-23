# Build Guide

One codebase targets four form factors: Android phone, Android tablet, iPhone, iPad. There is no separate tablet SDK — responsive layout (Tailwind breakpoints) handles phone vs. tablet within the same Android and iOS builds.

## Local development (web preview)

Fast iteration loop without touching native shells:

```
npm run dev
```

Opens the app in a browser. Good for UI/layout work, not for testing native features (push notifications, background location, calling).

## Android (build on Windows)

1. Make your changes in `src/`.
2. Sync web build into the native Android project:
   ```
   npx cap sync android
   ```
3. Open the `android/` folder in Android Studio.
4. Run on an emulator (create both a phone and a tablet AVD in Android Studio's Device Manager to test both layouts) or a physical device connected via USB with Developer Mode + USB debugging enabled.

### Background location / foreground service (Android specifics)

- Requires `ACCESS_FINE_LOCATION` and, on Android 10+, a separate `ACCESS_BACKGROUND_LOCATION` prompt.
- Android 14+ requires declaring `FOREGROUND_SERVICE_LOCATION` in `AndroidManifest.xml`.
- Test on a physical device where possible — emulator location behavior isn't fully representative, and manufacturer battery-optimization behavior (Samsung, etc.) only shows up on real hardware.

## iOS (build on Mac)

1. Pull latest from Git, `npm install` if dependencies changed.
2. Sync web build into the native iOS project:
   ```
   npx cap sync ios
   ```
3. Open `ios/App/App.xcworkspace` in Xcode — **not** the `.xcodeproj` file (CocoaPods requires the workspace).
4. Select a simulator (test both an iPhone and an iPad simulator target) or a physical device signed with your Apple Developer account.
5. Build and run (Cmd+R).

### Background location / CallKit (iOS specifics)

- Add `NSLocationAlwaysAndWhenInUseUsageDescription` to `Info.plist` with a clear, honest justification string (e.g., "Used to share your location with family during SOS alerts and while location sharing is turned on").
- Enable Background Modes capability in Xcode: `Location updates` and `Voice over IP`.
- CallKit + PushKit (for reliably waking the app to show a native incoming-call screen when backgrounded) requires native Swift code — this is the one part of the app that can't stay pure Capacitor/JS and will need a custom native plugin.
- iPad Split View / Slide Over multitasking must work reasonably well — Apple checks this in review.

## Testing checklist before any release build

- [ ] SOS button rings on a second physical device (not just simulator/emulator) — background push reliability only shows up on real hardware
- [ ] Location sharing toggle correctly starts/stops the background service and updates Supabase state
- [ ] Layout verified on: Android phone, Android tablet, iPhone, iPad (simulator or device for each)
- [ ] App behaves correctly when backgrounded/killed and an SOS push arrives

## Permissions the native projects need

Capacitor generates the `ios/` and `android/` folders, but these entries have to be added by hand after `npx cap add`.

**iOS** (`ios/App/App/Info.plist`):

```xml
<key>NSMicrophoneUsageDescription</key>
<string>FamiTie uses the microphone to send your voice messages to your family.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>FamiTie shares your location with your family circle when you send an alert or turn on location sharing.</string>
```

**Android** (`android/app/src/main/AndroidManifest.xml`, inside `<manifest>`):

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

The location permissions come with the Capacitor Geolocation plugin. Background location (the "Always" and background permissions described above) is added later together with the background-geolocation plugin.

Without the microphone entries, the hold-to-talk button will fail on a real phone even though it works in a desktop browser.
