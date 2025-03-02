export const PrivacyPolicy = () => {
  return (
    <div className="flex items-center justify-center mx-auto bg-white/80 py-24">
      <article className="prose overflow-auto">
        <h1>Privacy Policy</h1>
        <p>Last updated: 2024-11-23</p>

        <h2>Introduction</h2>
        <p>
          This Privacy Policy explains how we collect, use, process, and disclose your information when you use our
          service.
        </p>

        <h2>Information We Collect</h2>
        <p>We collect information in the following ways:</p>
        <ul>
          <li>
            <strong>Information you provide to us directly:</strong> Information that you submit through our service,
            including registration information, profile information, and any other information you choose to provide.
          </li>
          <li>
            <strong>Usage Information:</strong> We collect information about your interactions with our service using
            PostHog analytics, including:
            <ul>
              <li>Pages you visit</li>
              <li>Features you use</li>
              <li>Actions you take</li>
              <li>Time spent on pages</li>
              <li>Technical information about your device and internet connection</li>
            </ul>
          </li>
        </ul>

        <h2>How We Use Your Information</h2>
        <p>We use the collected information for various purposes:</p>
        <ul>
          <li>To provide and maintain our service</li>
          <li>To notify you about changes to our service</li>
          <li>To provide customer support</li>
          <li>To monitor usage of our service</li>
          <li>To detect, prevent, and address technical issues</li>
        </ul>

        <h2>Data Storage</h2>
        <p>
          We use Supabase as our database provider. Your data is stored securely and processed in accordance with their
          security standards and practices. For more information about Supabase's security practices, you can visit
          their security documentation.
        </p>

        <h2>Analytics</h2>
        <p>
          We use PostHog, an open-source analytics platform, to understand how our service is used. PostHog collects
          anonymous usage data that helps us improve our service. You can learn more about PostHog's privacy practices
          on their website.
        </p>

        <h2>Cookies and Tracking</h2>
        <p>
          We use cookies and similar tracking technologies to track activity on our service and hold certain
          information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
        </p>

        <h2>Data Retention</h2>
        <p>
          We will retain your information only for as long as necessary to fulfill the purposes outlined in this Privacy
          Policy. We will retain and use your information to the extent necessary to comply with our legal obligations,
          resolve disputes, and enforce our policies.
        </p>

        <h2>Your Rights</h2>
        <p>You have the following data protection rights:</p>
        <ul>
          <li>The right to access, update, or delete your information</li>
          <li>The right to rectification</li>
          <li>The right to object</li>
          <li>The right of restriction</li>
          <li>The right to data portability</li>
          <li>The right to withdraw consent</li>
        </ul>

        <h2>Changes to This Privacy Policy</h2>
        <p>
          We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
          Privacy Policy on this page and updating the "Last updated" date.
        </p>
      </article>
    </div>
  )
}
