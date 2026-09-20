import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', '@react-pdf/renderer', '@openai/codex-sdk', '@openai/codex'],
};

export default nextConfig;
