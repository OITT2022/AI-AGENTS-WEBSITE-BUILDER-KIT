export type Role = "admin" | "operator" | "viewer";

export interface Permission {
  resource: string;
  actions: string[];
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    { resource: "*", actions: ["*"] },
  ],
  operator: [
    { resource: "runs", actions: ["create", "read", "update"] },
    { resource: "tasks", actions: ["create", "read", "update"] },
    { resource: "agents", actions: ["read", "execute"] },
    { resource: "settings", actions: ["read"] },
  ],
  viewer: [
    { resource: "runs", actions: ["read"] },
    { resource: "tasks", actions: ["read"] },
    { resource: "agents", actions: ["read"] },
    { resource: "settings", actions: ["read"] },
  ],
};

export function hasPermission(role: Role, resource: string, action: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.some((p) => {
    const resourceMatch = p.resource === "*" || p.resource === resource;
    const actionMatch = p.actions.includes("*") || p.actions.includes(action);
    return resourceMatch && actionMatch;
  });
}

export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}
