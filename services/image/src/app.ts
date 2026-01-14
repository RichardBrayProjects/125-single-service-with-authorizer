import express, { Request, Response, Application, NextFunction } from "express";
import cors from "cors";
import imageRoutes from "./routes/imageRoutes";

const app: Application = express();

app.use(
  cors({
    origin: true,
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "image-service" });
});

app.use("/v1", imageRoutes);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err);
  const status = err?.status || 500;
  const message = err?.message || "Internal server error";
  res.status(status).json({ error: message });
});

export { app };
export default app;
