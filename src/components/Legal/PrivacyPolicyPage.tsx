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
          stores your email, your saved timelines, and — if you are signed in
          and have added one — your encrypted API key.
        </li>
        <li>
          <strong>Netlify</strong> — hosts and serves the website.
        </li>
        <li>
          <strong>Anthropic</strong> and <strong>OpenAI</strong> — when you
          generate a timeline or event description with AI, the subject or
          event title you typed (plus dates and the timeline's title) is sent
          to whichever provider is in use. We never include your email,
          account ID, or any other identifier in these requests.
        </li>
        <li>
          <strong>Wikipedia / Wikimedia</strong> — subject suggestions and event
          images are fetched directly from your browser, so Wikimedia's servers
          see your IP address the same way they would if you visited Wikipedia
          yourself.
        </li>
      </ul>

      <h2>If you use your own API key</h2>
      <p>
        You can bring your own OpenAI or Anthropic API key. Where it is kept
        depends on whether you are signed in.
      </p>
      <p>
        <strong>Signed out</strong> — the key is stored only in your browser's
        local storage and is never sent to our servers.
      </p>
      <p>
        <strong>Signed in</strong> — the key is sent to our server once, when
        you save it, and stored against your account. It is encrypted before
        it is written down, with a key held only in our server configuration
        and never in the database, so it is not readable from a copy of the
        database alone. We store it so that it works on every device you sign
        in on rather than only the one you pasted it into. A copy is also kept
        in that browser's local storage, which is what the app reads from.
      </p>
      <p>
        Either way, AI requests themselves go directly from your browser to
        the provider whose key you supplied — they do not pass through our
        servers. That provider sees your IP address for those requests, and
        bills the usage to your account with them rather than to us.
      </p>
      <p>
        Anyone with access to your device and browser profile could read the
        stored key. Signing out removes it from that browser but leaves it on
        your account; removing it in Settings deletes it from your account and
        from the browser; deleting your account deletes it along with
        everything else.
      </p>
      <p>
        Requests we send to OpenAI on your behalf are marked not to be stored,
        so they do not accumulate in your OpenAI dashboard. If you save keys
        for both providers, the model you pick decides which provider receives
        your requests, and only that provider receives them.
      </p>

      <h2>What we store in your browser</h2>
      <p>
        Local storage on your device may hold: unsaved timeline drafts, your
        optional OpenAI or Anthropic API keys (which are also stored on your
        account while you are signed in), AI-generated content for shared
        timelines you've viewed, your session sign-in token, and interface
        preferences. Clearing your browser's site data removes all of it.
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
