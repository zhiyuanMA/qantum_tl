/** Static export: this slice has no server. BASE_PATH is set by the Pages deployment. */
const basePath = process.env.BASE_PATH || undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
};

export default nextConfig;
