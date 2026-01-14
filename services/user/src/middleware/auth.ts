import { Request, Response, NextFunction } from "express";

export interface AuthUser {
  sub: string;
  email?: string;
  groups: string[];
}

interface ApiGatewayEvent {
  requestContext: {
    authorizer?: {
      claims?: {
        sub?: string;
        email?: string;
        "cognito:groups"?: string | string[];
      };
    };
  };
}

interface ExtendedRequest extends Request {
  apiGateway?: {
    event: ApiGatewayEvent;
  };
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  const extendedReq = req as ExtendedRequest;
  const claims =
    extendedReq.apiGateway?.event?.requestContext?.authorizer?.claims;

  if (claims) {
    let groups: string[] = [];
    if (claims["cognito:groups"]) {
      if (typeof claims["cognito:groups"] === "string") {
        groups = claims["cognito:groups"].split(",").map((g) => g.trim());
      } else if (Array.isArray(claims["cognito:groups"])) {
        groups = claims["cognito:groups"];
      }
    }

    (req as any).auth = {
      sub: claims.sub || "",
      email: claims.email,
      groups,
    } as AuthUser;
  }

  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthUser | undefined;
  if (!auth || !auth.sub) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

export function requireGroup(groupName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthUser | undefined;
    if (!auth || !auth.groups.includes(groupName)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
