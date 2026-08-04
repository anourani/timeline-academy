import { Link } from 'react-router-dom'
import { LegalLayout } from './LegalLayout'

// NOTE: This is an engineering-authored draft. Have it reviewed by counsel
// before treating it as a finished legal document.

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="August 3, 2026">
      <p>
        Timeline Academy is an educational tool for creating, exploring, and
        sharing timelines. By using it you agree to these terms.
      </p>

      <h2>Your content</h2>
      <p>
        Timelines you create belong to you. By clicking Share on a timeline you
        make its content viewable by anyone who has the link, until you
        unshare or delete it. Don't use timelines to publish content that is
        unlawful, harassing, or that infringes someone else's rights.
      </p>

      <h2>AI-generated content</h2>
      <p>
        Timelines and event descriptions can be generated with AI. AI output
        can be wrong: dates, attributions, and descriptions may contain errors
        despite our source-grounding efforts. Verify anything you rely on for
        schoolwork, research, or publication.
      </p>

      <h2>Fair use of the service</h2>
      <p>
        Server-funded AI generation is subject to daily limits. Don't attempt
        to circumvent limits, probe or disrupt the service, or access other
        users' data. If you use your own Anthropic API key, your use of
        Anthropic's API is governed by Anthropic's own terms, and you are
        responsible for the key and its charges.
      </p>

      <h2>Accounts</h2>
      <p>
        An account only requires a working email address. You can delete your
        account and all its data at any time from the account panel. We may
        suspend accounts that abuse the service.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided as-is, without warranties of any kind. We may
        change or discontinue features at any time. To the maximum extent
        permitted by law, we are not liable for indirect or consequential
        damages arising from your use of the service.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:alex@timeline.academy">alex@timeline.academy</a>.
      </p>

      <p>
        See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalLayout>
  )
}
