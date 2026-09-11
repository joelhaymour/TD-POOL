import type { NextConfig } from "next";
import path from "path";
import { assertEnvironment } from "./scripts/environment.mjs";

assertEnvironment(process.env);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Cursor / Simple Browser often opens 127.0.0.1 instead of localhost
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
