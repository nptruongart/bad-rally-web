/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Dòng này ép Next.js xuất ra file HTML/CSS tĩnh để bỏ vào App
  eslint: { ignoreDuringBuilds: true }
};
export default nextConfig;