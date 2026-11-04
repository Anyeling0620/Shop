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
    // 商品图片实际由 web-app 的静态目录提供（goods-service 里没有 /img 资源），
    // 因此 /backend-img/* 透传到 GOODS_STATIC_ORIGIN（默认 web-app :18004）
    return [
      {
        source: '/backend-img/:path*',
        destination: `${process.env.GOODS_STATIC_ORIGIN ?? 'http://127.0.0.1:18004'}/img/:path*`,
      },
    ];
  },
};

export default nextConfig;
