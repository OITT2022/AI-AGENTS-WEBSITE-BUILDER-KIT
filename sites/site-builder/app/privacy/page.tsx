import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Site Builder AI",
  description: "Privacy Policy for Site Builder AI at 2op.co.il",
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">← חזרה</Link>

        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-subtitle">Site Builder AI — https://2op.co.il</p>

        <div className="legal-content">
          <p className="legal-intro">
            Welcome to Site Builder AI (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;), accessible at https://2op.co.il.
            Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information.
          </p>

          <section>
            <h2>1. Information We Collect</h2>

            <h3>1.1 Personal Information</h3>
            <p>When you register, we collect:</p>
            <ul>
              <li>First Name</li>
              <li>Last Name</li>
              <li>Email Address</li>
            </ul>

            <h3>1.2 Authentication Data</h3>
            <p>One-Time Password (OTP) sent to your email for verification.</p>

            <h3>1.3 User-Generated Content</h3>
            <ul>
              <li>Branding inputs (URLs, competitor references)</li>
              <li>Text descriptions</li>
              <li>Media preferences (images, videos)</li>
              <li>Files uploaded via Google Drive integration</li>
            </ul>

            <h3>1.4 Technical Data</h3>
            <ul>
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device information</li>
              <li>Usage logs</li>
            </ul>
          </section>

          <section>
            <h2>2. How We Use Your Information</h2>
            <p>We use your data to:</p>
            <ul>
              <li>Authenticate users via OTP</li>
              <li>Provide and operate the platform</li>
              <li>Generate AI-based website content</li>
              <li>Improve system performance and user experience</li>
              <li>Store and manage generated websites</li>
              <li>Provide downloadable or hosted site outputs</li>
            </ul>
          </section>

          <section>
            <h2>3. Google Drive Integration</h2>
            <p>If you choose to connect your Google Drive:</p>
            <ul>
              <li>We access only the files you explicitly authorize</li>
              <li>We do not store your Google credentials</li>
              <li>Access is limited to content used for your site generation</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Storage &amp; Security</h2>
            <ul>
              <li>Data is stored on secure servers</li>
              <li>We implement industry-standard security measures</li>
              <li>OTP authentication adds an additional security layer</li>
            </ul>
            <p>However, no system is 100% secure.</p>
          </section>

          <section>
            <h2>5. Data Retention</h2>
            <p>We retain your data:</p>
            <ul>
              <li>As long as your account is active</li>
              <li>Or as needed to provide services</li>
            </ul>
            <p>Generated websites may remain accessible via https://2op.co.il/sites/Your_Site</p>
          </section>

          <section>
            <h2>6. Sharing of Information</h2>
            <p>We do not sell your personal data.</p>
            <p>We may share data:</p>
            <ul>
              <li>With service providers (hosting, cloud services)</li>
              <li>If required by law</li>
              <li>To protect rights and security</li>
            </ul>
          </section>

          <section>
            <h2>7. User Rights</h2>
            <p>Depending on your jurisdiction, you may request:</p>
            <ul>
              <li>Access to your data</li>
              <li>Correction or deletion</li>
              <li>Data portability</li>
            </ul>
            <p>Contact us at: <a href="mailto:info@2op.co.il">info@2op.co.il</a></p>
          </section>

          <section>
            <h2>8. Cookies</h2>
            <p>We may use cookies for:</p>
            <ul>
              <li>Session management</li>
              <li>Analytics</li>
              <li>Performance improvements</li>
            </ul>
          </section>

          <section>
            <h2>9. Third-Party Links</h2>
            <p>We are not responsible for third-party websites referenced in generated content.</p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy. Updates will be posted on this page.</p>
          </section>

          <section>
            <h2>11. Contact</h2>
            <p>For questions: <a href="mailto:info@2op.co.il">info@2op.co.il</a></p>
          </section>
        </div>

        <div className="legal-footer">
          <Link href="/terms">Terms of Service</Link>
          <span>•</span>
          <Link href="/">Site Builder AI</Link>
        </div>
      </div>
    </div>
  );
}
