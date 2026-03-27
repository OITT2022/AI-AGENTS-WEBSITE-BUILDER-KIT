"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users);
        setTotalCount(data.totalCount);
      }
    } catch {
      setError("שגיאת תקשורת");
    }
    setLoading(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">ניהול משתמשים</h1>
          <p className="admin-subtitle">סה״כ {totalCount} משתמשים רשומים</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-secondary" onClick={fetchUsers}>רענן</button>
          <button className="btn btn-secondary" onClick={() => router.push("/")}>חזרה לבונה</button>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <span className="spinner" style={{ width: 24, height: 24 }} /> טוען...
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>שם פרטי</th>
                <th>שם משפחה</th>
                <th>אימייל</th>
                <th>תאריך הרשמה</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                    אין משתמשים רשומים עדיין
                  </td>
                </tr>
              ) : (
                users.map((user, i) => (
                  <tr key={user.id}>
                    <td className="admin-cell-num">{i + 1}</td>
                    <td>{user.first_name}</td>
                    <td>{user.last_name}</td>
                    <td dir="ltr" className="admin-cell-email">{user.email}</td>
                    <td className="admin-cell-date">
                      {new Date(user.created_at).toLocaleString("he-IL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
