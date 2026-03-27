import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { getSession } from "../../../lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDb();

  const users = await sql`
    SELECT
      id,
      first_name,
      last_name,
      email,
      created_at
    FROM users
    ORDER BY created_at DESC
  `;

  const totalCount = users.length;

  return NextResponse.json({ users, totalCount });
}
