import serverlessExpress from "@vendia/serverless-express";
import type { Handler } from "aws-lambda";
import { app } from "./app";

console.log("BOOT: image service index.ts loaded");

// Normal vendia handler (no wrapper, no globals, no ALS in your code)
export const handler: Handler = serverlessExpress({ app });
