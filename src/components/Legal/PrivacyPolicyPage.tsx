import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'

// NOTE: This is an engineering-authored draft that accurately describes the
// product's data flows. Have it reviewed by counsel before treating it as a
// finished legal document.

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="August 3, 2026">
      <p>
        Timeline Academy is an educational tool for building and exploring
        timelines. We collect as little personal information as we can: no
        analytics, no advertising trackers, and no third-party scripts run on
        this site.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Email address</strong> — the only personal information we ask
          for, used solely to sign you in (we send a one-time code) and to
          associate your saved timelines with your account. Signing in is
          optional; you can build timelines without an account.
        </li>
        <li>
          <strong>Your timeline content</strong> — titles, descriptions, events,
          and categories you create. Saved to our database when you're signed
          in; kept only in your browser's local storage when you're not.
        </li>
        <li>
          <strong>AI usage counts</strong> — when you use our server-funded AI
          generation, we record a timestamped count against your account to
          enforce daily limits. These records are deleted after 24 hours.
        </li>
      </ul>

      <h2>Service providers we rely on</h2>
      <ul>
        <li>
          <strong>Supabase</strong> — hosts our database and sign-in system;
          stores your email and saved timelines.
        </li>
        <li>
          <strong>Netlify</strong> — hosts and serves the website.
        </li>
        <li>
          <strong>Anthropic</strong> (and, as a fallback, <strong>OpenAI</strong>)
          — when you generate a timeline or event description with AI, the
          subject or event title you typed (plus dates and the timeline's
          title) is sent to the AI provider. We never include your email,
          account ID, or any other identifier in these requests.
        </li>
        <li>
          <strong>Wikipedia / Wikimedia</strong> — subject suggestions and event
          images are fetched directly from your browser, so Wikimedia's servers
          see your IP address the same way they would if you visited Wikipedia
          yourself.
        </li>
      </ul>

      <h2>If you use your own Anthropic API key</h2>
      <p>
        In bring-your-own-key mode, your key is stored only in your browser's
        local storage — it is never sent to our servers. AI requests then go
        directly from your browser to Anthropic, which means Anthropic sees
        your IP address for those requests. Anyone with access to your device
        and browser profile could read the stored key; remove it in Settings
        any time.
      </p>

      <h2>What we store in your browser</h2>
      <p>
        Local storage on your device may hold: unsaved timeline drafts, your
        optional Anthropic API key, AI-generated content for shared timelines
        you've viewed, your session sign-in token, and interface preferences.
        Clearing your browser's site data removes all of it.
      </p>

      <h2>Sharing timelines</h2>
      <p>
        Timelines are private by default. If you click Share, anyone with the
        link can view that timeline (not your email or account details). You
        can stop sharing at any time with Unshare, after which the link stops
        working.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can delete individual timelines and events at any time, and you can
        delete your entire account — including your email and all saved
        content — from the account panel. Deletion is immediate and permanent.
        You can also export your timelines as spreadsheets before deleting.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data:{' '}
        <a href="mailto:alex@timeline.academy">alex@timeline.academy</a>.
      </p>

      <p>
        See also our <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalLayout>
  )
}
