import { cookies } from "next/headers";
import { verifyToken } from "./lib/auth";
import AuthGate from "./components/AuthGate";
import SiteBuilder from "./components/SiteBuilder";

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let user: { firstName: string; lastName: string; email: string; admin?: boolean } | null = null;

  if (token) {
    try {
      const session = await verifyToken(token);
      user = {
        firstName: session.firstName,
        lastName: session.lastName,
        email: session.email,
        admin: session.admin === true,
      };
    } catch {
      // Invalid token — show auth
    }
  }

  return user ? <SiteBuilder user={user} /> : <AuthGate />;
}
