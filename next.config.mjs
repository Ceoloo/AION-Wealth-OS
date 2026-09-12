/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Domain logic is framework-agnostic; keep the build strict so typecheck gates CI.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
