/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse'],
  allowedDevOrigins: ['http://172.30.1.73:3000'],
};

export default nextConfig;
