export default function Privacy() {
  return (
    <div className="privacy-policy">
      <h1>Privacy Policy</h1>
      <p><em>Last updated: May 21, 2026</em></p>

      <h2>1. Information We Collect</h2>
      <p>
        When you connect your Facebook or Instagram account through Mediamation, we collect:
      </p>
      <ul>
        <li>Your name, email address, and profile picture</li>
        <li>Your Facebook Pages and Instagram Business Accounts you authorize</li>
        <li>Access tokens required to publish and manage posts on your behalf</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the collected data solely to:</p>
      <ul>
        <li>Authenticate your identity</li>
        <li>Schedule and publish posts to your connected social media accounts</li>
        <li>Display your connected accounts and their basic info in the dashboard</li>
      </ul>

      <h2>3. Data Storage & Security</h2>
      <p>
        Your access tokens are stored securely in our database. We use industry-standard
        encryption and follow security best practices. We never share your data with
        third parties.
      </p>

      <h2>4. Data Retention</h2>
      <p>
        We retain your data as long as your account is active. You may disconnect any
        social account at any time, which revokes our access and removes the associated
        data from our system.
      </p>

      <h2>5. Your Rights</h2>
      <p>
        You can request deletion of your account and all associated data at any time
        by contacting us. Disconnecting a social account immediately stops all access.
      </p>

      <h2>6. Contact</h2>
      <p>
        If you have questions about this policy, please contact us at
        privacy@mediamation.app.
      </p>
    </div>
  );
}
