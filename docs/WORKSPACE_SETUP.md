# Workspace Setup

Development is split across two machines: **Windows** (Android + all React/web work) and **Mac** (iOS builds, which require Xcode).

## Windows machine

1. **Node.js** — install the current LTS release from nodejs.org. Verify with:
   ```
   node -v
   npm -v
   ```
2. **Android Studio** — install from developer.android.com/studio. This provides the Android SDK, platform tools, an emulator, and Gradle.
3. **Environment variables** — set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your SDK path, typically:
   ```
   C:\Users\<you>\AppData\Local\Android\Sdk
   ```
   Add `%ANDROID_HOME%\platform-tools` to your PATH.
4. **Git** — install Git for Windows if not already present.
5. **Editor** — VS Code (or your preferred editor) with ESLint/Prettier extensions recommended.

## Mac machine (iOS builds only)

1. **Xcode** — install from the App Store. Required for any iOS build, signing, or simulator testing — there is no way around building iOS elsewhere.
2. **CocoaPods** — Capacitor's iOS project uses CocoaPods for native dependencies:
   ```
   sudo gem install cocoapods
   ```
   or via Homebrew: `brew install cocoapods`
3. **Git** — confirm it's installed (`git --version`); already set up per prior notes.
4. **Apple Developer account** — required for running on physical devices and for entitlements this app needs (Push Notifications, Background Modes: location + VoIP). Enroll at developer.apple.com if not already done.

## Repository workflow

Git is the source of truth between the two machines — there is no shared filesystem.

```
# On Windows (primary development)
git add .
git commit -m "..."
git push

# On Mac (before iOS builds)
git pull
npm install          # in case package.json changed
npx cap sync ios      # push latest web build into the iOS native project
```

## Project setup (first time only)

Run once, on Windows, then pushed to Git so Mac can pull the same project:

```
npm create vite@latest famitie -- --template react-ts
cd famitie
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install @capacitor/core @capacitor/cli
npx cap init
npm install @supabase/supabase-js
npx cap add android
npx cap add ios
```

`npx cap add ios` can be run on Windows (it just generates the folder); actually opening/building the iOS project requires Xcode on Mac.

## Supabase

1. Create a project at supabase.com.
2. Copy the project URL and anon key into a `.env` file (never commit this):
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. Add `.env` to `.gitignore`.
