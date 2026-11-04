import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 后端 image 字段是 /img/xxx.jpeg 这类网关相对路径，SSR 侧统一改写为后端静态地址
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '18001', pathname: '/**' },
      { protocol: 'http', hostname: '10.217.238.17', pathname: '/**' },
    ],
  },
  async rewrites() {
    // 后端没有把图片放 CDN，这里把 /backend-img/* 透传到 goods-service 的静态资源
    return [
      {
        source: '/backend-img/:path*',
        destination: `${process.env.GOODS_STATIC_ORIGIN ?? 'http://127.0.0.1:18001'}/img/:path*`,
      },
    ];
  },
};

export default nextConfig;
