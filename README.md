# Authorizer working in this version

```

The image service is where the fix for getting vendia serverless express working properly with the api gateway authorizer was found.

See services/image/src/middleware/auth.ts

the use of getCurrentInvoke in the function below is essential to getting everything working ... it gives full access to the event which was passed into the lambda (and which was intercepted by serverless express). That event has access to all the authorizer data including claims.

All node express code going forward should be written to work the same way as the IMAGE SERVICE in this project !



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
```
