/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // The ACCO logo is a local asset — allow unoptimized for the static PNG
    // to avoid requiring a remote domain configuration.
    unoptimized: false,
  },
};

export default nextConfig;
