import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Site Builder AI",
  description: "Terms of Service for Site Builder AI at 2op.co.il",
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">← חזרה</Link>

        <h1 className="legal-title">Terms of Service</h1>
        <p className="legal-subtitle">Site Builder AI — https://2op.co.il</p>

        <div className="legal-content">
          <p className="legal-intro">
            By accessing https://2op.co.il, you agree to these Terms.
          </p>

          <section>
            <h2>1. Service Description</h2>
            <p>Site Builder AI provides:</p>
            <ul>
              <li>AI-powered website generation tools</li>
              <li>Branding analysis tools</li>
              <li>Content creation workflows</li>
              <li>File and media integration</li>
              <li>Website export and hosting preview</li>
            </ul>
          </section>

          <section>
            <h2>2. User Account</h2>
            <p>You agree to:</p>
            <ul>
              <li>Provide accurate information</li>
              <li>Maintain confidentiality of your email access</li>
              <li>Be responsible for all activity under your account</li>
            </ul>
            <p>Authentication is done via OTP (One-Time Password).</p>
          </section>

          <section>
            <h2>3. Acceptable Use</h2>
            <p>You agree NOT to:</p>
            <ul>
              <li>Use the service for illegal activities</li>
              <li>Upload harmful or malicious content</li>
              <li>Violate intellectual property rights</li>
              <li>Attempt to hack or disrupt the system</li>
            </ul>
          </section>

          <section>
            <h2>4. User Content</h2>
            <p>You retain ownership of content you provide.</p>
            <p>However, you grant us a license to:</p>
            <ul>
              <li>Process</li>
              <li>Analyze</li>
              <li>Generate outputs based on your input</li>
            </ul>
          </section>

          <section>
            <h2>5. AI-Generated Content</h2>
            <ul>
              <li>Outputs are generated automatically by AI</li>
              <li>We do not guarantee accuracy, legality, or originality</li>
              <li>You are responsible for reviewing and using the generated content</li>
            </ul>
          </section>

          <section>
            <h2>6. Hosting &amp; Generated Sites</h2>
            <p>Generated websites:</p>
            <ul>
              <li>May be hosted temporarily at https://2op.co.il/sites/Your_Site</li>
              <li>Are publicly accessible if link is shared</li>
              <li>May be deleted or removed at our discretion</li>
            </ul>
          </section>

          <section>
            <h2>7. Intellectual Property</h2>
            <ul>
              <li>The platform and technology are owned by Site Builder AI</li>
              <li>Users receive a license to use generated outputs</li>
            </ul>
          </section>

          <section>
            <h2>8. Limitation of Liability</h2>
            <p>We are not liable for:</p>
            <ul>
              <li>Loss of data</li>
              <li>Business losses</li>
              <li>Legal issues arising from generated content</li>
              <li>Third-party integrations</li>
            </ul>
            <p>Use the service at your own risk.</p>
          </section>

          <section>
            <h2>9. Service Availability</h2>
            <p>We do not guarantee:</p>
            <ul>
              <li>Continuous uptime</li>
              <li>Error-free operation</li>
            </ul>
            <p>We may modify or discontinue features at any time.</p>
          </section>

          <section>
            <h2>10. Termination</h2>
            <p>We may suspend or terminate accounts if:</p>
            <ul>
              <li>Terms are violated</li>
              <li>Abuse is detected</li>
            </ul>
          </section>

          <section>
            <h2>11. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Israel.</p>
          </section>

          <section>
            <h2>12. Changes to Terms</h2>
            <p>We may update these Terms periodically.</p>
          </section>

          <section>
            <h2>13. Contact</h2>
            <p>For questions: <a href="mailto:info@2op.co.il">info@2op.co.il</a></p>
          </section>
        </div>

        <div className="legal-footer">
          <Link href="/privacy">Privacy Policy</Link>
          <span>•</span>
          <Link href="/">Site Builder AI</Link>
        </div>
      </div>
    </div>
  );
}
