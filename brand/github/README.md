# GitHub: the toknlabs org

The org exists. What is left is moving the OAuth app into it and pointing the
app at the real domain. Neither can be done from here — GitHub has no REST API
for OAuth app management or for org creation, so both are browser tasks.

## 1. Move the OAuth app to toknlabs

The app that powers "sign in with GitHub" currently lives under **eaonlabs**,
client id `Ov23liBtuXOURnJB6cb4`.

GitHub supports transferring an OAuth app to an organization:

1. **Settings → Developer settings → OAuth apps →** the tokn app
2. **Transfer ownership**
3. Type the app's name to confirm, enter `toknlabs`, and confirm
4. Then, as the org: **OAuth apps → Pending transfer requests →** the app →
   **Complete transfer**

**Check the client id afterwards.** GitHub's documentation describes the
transfer but does not say whether the client id and secret survive it. If they
are unchanged, nothing else needs doing. If either changed, update
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env` and restart — everyone
who signed in with GitHub would otherwise be unable to sign in again.

(An earlier version of this file said OAuth apps could not be transferred and
that a new app had to be registered. That was wrong.)

### If you would rather register a fresh app

Nothing is lost by doing it this way, it is just more steps: create the app
under toknlabs, put the new id and secret in `.env`, and delete the old app
once sign-in works. The only cost is that anyone mid-session gets signed out.

## 2. Callback URLs

The app needs both, so local development keeps working after the site is live:

    http://localhost:3000/api/auth/github/callback
    https://toknhq.com/api/auth/github/callback

GitHub OAuth apps accept several callback URLs. The backend builds the callback
from `TOKN_PUBLIC_URL`, so whichever origin the server thinks it is on is the
one it will send people back to.

## 3. Org profile

1. **Settings → Profile picture** → upload `org-avatar-500.png`
2. **Description** → `Track what AI coding actually costs you.`
3. **URL** → `https://toknhq.com`
4. Create a public repo named exactly **`.github`** and copy `dot-github-repo/`
   into it. GitHub renders `profile/README.md` on the org's front page. The
   image path in it already points at `toknlabs`.

## Already done in the code

Support and contact links in `/terms`, `/privacy` and account settings now
point at `github.com/toknlabs`.
