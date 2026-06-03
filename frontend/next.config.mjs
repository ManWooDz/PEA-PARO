/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone/server.js) so the
  // Docker runtime image stays small and runs exactly like `next start`.
  output: "standalone",
};

export default nextConfig;
