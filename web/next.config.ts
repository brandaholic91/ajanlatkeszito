import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A build egy önállóan futtatható mappát készít (.next/standalone), csak a szükséges fájlokkal.
  // Ezt másolja be a Dockerfile a kész image-be, így oda nem kell a teljes node_modules.
  output: "standalone",
};

export default nextConfig;
