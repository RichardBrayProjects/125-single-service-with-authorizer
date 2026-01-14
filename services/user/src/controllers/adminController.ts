import { Request, Response } from "express";
import { debug } from "../utils/debug";

export function getAdmin(_: Request, res: Response) {
  debug("--- getAdmin() ---");
  try {
    res.json({
      status: "ok",
      message: "getAdmin endpoint accessible",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Error in getAdmin" });
  }
}
