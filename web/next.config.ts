import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @samad001z/norn-core pulls in better-sqlite3 (native) + sqlite-vec (loadable
  // extension). Keep them external so Next never tries to bundle the binary;
  // they're required at runtime from node_modules on the server.
  serverExternalPackages: [
    "@samad001z/norn-core",
    "better-sqlite3",
    "sqlite-vec",
    "@xenova/transformers",
    "onnxruntime-node",
  ],
};

export default nextConfig;
