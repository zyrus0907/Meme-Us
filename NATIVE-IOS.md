# Meme Us iOS setup

The `ios/` project is a Capacitor wrapper around the existing Next.js app. It
currently loads `https://meme-us.vercel.app`, so the website must be deployed
before a device build can see new web changes.

## One-time setup

1. Install Xcode 26 from the Mac App Store and open it once to finish setup.
2. If macOS is still using Command Line Tools, run:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
3. In Supabase Dashboard, open Authentication > URL Configuration and add
   `memeus://auth/callback` to **Redirect URLs**.
4. Run `npm install` and then `npm run cap:sync`.
5. Run `npm run cap:open` and select the **App** project in Xcode.
6. Under Signing & Capabilities, choose your Apple Developer team. Keep the
   bundle identifier as `com.cyrus.memeus`, unless that identifier is already
   owned by someone else.

## Test on an iPhone

1. Connect and trust the iPhone.
2. Select it as the Xcode run destination.
3. Press Run.
4. Test Google sign-in, Apple sign-in, camera, photo library, submission,
   partner reveal, account deletion, offline behavior, and permission denial.

## Before TestFlight/App Store review

- Replace the phase-one remote `server.url` approach with a locally bundled
  client, or obtain a deliberate App Review strategy for the remote shell.
- Add the Push Notifications capability, create the APNs key/certificate, and
  add a native device-token endpoint. The existing backend stores Web Push
  subscriptions and cannot send directly to APNs tokens.
- Create App Store Connect screenshots, privacy details, age rating, support
  URL, privacy-policy URL, and review notes/test credentials.
- Archive a Release build in Xcode and validate it before uploading.

## Updating native files after a code/config change

Run `npm run cap:sync`. Icon changes also require `npm run cap:assets` before
syncing. Web-only changes currently require a Vercel deployment because the
iOS wrapper loads the production URL.
