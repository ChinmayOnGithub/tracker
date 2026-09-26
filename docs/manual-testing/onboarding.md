# Tracker Onboarding & Google Calendar

## OAuth separation

Tracker intentionally uses two Google OAuth flows:

- Sign-in: `/api/auth/google` → `/api/auth/callback/google`
  - Requests only `openid email profile`.
- Calendar connection: `/api/integrations/google-calendar` → `/api/integrations/google-calendar/callback`
  - Requests `https://www.googleapis.com/auth/calendar`.
  - Stores the refresh token encrypted through `GoogleCredentialService`.
  - Runs the initial calendar sync and attempts to establish the existing webhook watch channel.

The flows use different state and PKCE cookies so an authentication callback cannot accidentally consume a calendar authorization.

## Google Cloud Console

The same OAuth client can be used for both flows, but both callback URLs must be registered exactly:

```text
https://<your-site>/api/auth/callback/google
https://<your-site>/api/integrations/google-calendar/callback
```

For local development:

```text
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/integrations/google-calendar/callback
```

The Google OAuth redirect URI must exactly match the registered URI.

## Onboarding behavior

The onboarding journey:

1. Captures task-source preferences.
2. Lets the user select and connect Google Calendar in context.
3. Captures work hours and browser time zone.
4. Captures planning style and adapts capacity language/duration.
5. Captures up to three focus areas.
6. Captures a first-day objective.
7. Generates one real Tracker activity from the objective.
8. Uses the selected work window and Google Calendar commitments to find an available slot when possible.

The final activity is idempotent: completing the same onboarding state again does not create duplicate first-day activities when the generated activity still exists.

## Calendar discovery

After the OAuth callback completes, the onboarding page reads the synchronized local calendar data for the next seven days and shows a compact “we found your week” preview.

Google Calendar synchronization continues to use Tracker's existing sync-token and webhook architecture. Initial authorization performs a full sync; later changes use the persisted sync token and webhook-triggered synchronization.
