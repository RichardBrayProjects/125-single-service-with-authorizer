import { Request, Response, NextFunction } from "express";

// Authentication works like this ...
//
// Browser
//   └─ Authorization: Bearer <JWT>

// API Gateway (REST, v1)
//   └─ Cognito User Pool Authorizer
//       └─ Injects claims into event.requestContext.authorizer

// Lambda
//   └─ vendia serverless-express
//       └─ tracks current invocation
//           └─ getCurrentInvoke()
//               └─ event.requestContext.authorizer.claims

// Express
//   └─ attachAuth middleware
//       └─ req.auth
//           └─ controllers

// Vendia exposes getCurrentInvoke(), but TS exports can be awkward depending on version.
// This require() pattern is the most robust in TS projects.
const { getCurrentInvoke } = require("@vendia/serverless-express");

export interface AuthUser {
  sub: string;
  email?: string;
  groups: string[];
}

type Claims = {
  sub?: string;
  email?: string;
  "cognito:groups"?: string | string[];
};

function parseGroups(raw: Claims["cognito:groups"]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
  }
  return [];
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  // getCurrentInvoke() returns { event, context } for the current Lambda invocation. :contentReference[oaicite:1]{index=1}
  const invoke = getCurrentInvoke?.();
  const event = invoke?.event;

  const claims: Claims | undefined = event?.requestContext?.authorizer?.claims;

  if (claims?.sub) {
    (req as any).auth = {
      sub: claims.sub,
      email: claims.email,
      groups: parseGroups(claims["cognito:groups"]),
    } as AuthUser;
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthUser | undefined;
  if (!auth?.sub) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

export function requireGroup(groupName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthUser | undefined;
    if (!auth?.groups?.includes(groupName)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
