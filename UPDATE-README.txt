FamiTie update 4 (includes update 3): end-to-end encrypted voice and chat, status/silent/offline
1. Supabase SQL Editor: run supabase/migrations/0005_status_modes.sql (if not yet) and then 0006_end_to_end_encryption.sql. Paste the CONTENTS of each file.
2. Optional: Database > Extensions > enable pg_cron, then run 0006 again (schedules the clean-up of expired clips).
3. Unzip over your project (your .env and ios/ folder are not in this zip).
4. npm install && npm run build && npx cap sync
5. Raise the build number in Xcode, archive, upload.
First sign-in on each phone shows a recovery code. Save it.
