import express, { Request, Response, Application } from "express";
import cors from "cors";
import configRoutes from "./routes/configRoutes";
import profileRoutes from "./routes/profileRoutes";
import adminRoutes from "./routes/adminRoutes";

const app: Application = express();

app.use(
  cors({
    origin: true,
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Authorization"],
  })
);

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "user-service" });
});

app.use("/v1/config", configRoutes);
app.use("/v1/profile", profileRoutes);
app.use("/v1/admin", adminRoutes);

app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("Error:", err);
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  res.status(status).json({ error: message });
});

export { app };
