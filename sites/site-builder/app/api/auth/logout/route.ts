import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
