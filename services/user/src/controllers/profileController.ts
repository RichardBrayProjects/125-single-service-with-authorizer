import { Request, Response } from "express";
import { debug } from "../utils/debug";

export function getProfile(_: Request, res: Response) {
  debug("--- getProfile() ---");
  try {
    res.json({
      status: "ok",
      message: "getProfile endpoint accessible",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Error in getProfile" });
  }
}
