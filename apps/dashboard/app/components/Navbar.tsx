import Link from "next/link";

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "2rem",
  padding: "1rem 1.5rem",
  borderBottom: "1px solid var(--border-color)",
  background: "var(--bg-secondary)",
};

const logoStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "1.1rem",
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
};

const linkStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  color: "var(--text-secondary)",
  transition: "color 0.15s ease",
};

export default function Navbar() {
  return (
    <nav style={navStyle}>
      <span style={logoStyle}>AI Agents Studio</span>
      <Link href="/" style={linkStyle}>
        Dashboard
      </Link>
      <Link href="/runs" style={linkStyle}>
        Runs
      </Link>
      <Link href="/settings" style={linkStyle}>
        Settings
      </Link>
    </nav>
  );
}
