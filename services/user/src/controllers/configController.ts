import { Request, Response } from "express";
import { debug } from "../utils/debug";

export async function getConfig(_: Request, res: Response) {
  debug("--- getConfig() ---");
  try {
    res.json({
      status: "ok",
      message: "getConfig endpoint accessible",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Error in getConfig" });
  }
}
