import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Next only reads .env from this folder; the keys live in the repo root .env
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const config: NextConfig = {
  // native module, has to stay out of the server bundle
  serverExternalPackages: ["better-sqlite3"],
};

export default config;
