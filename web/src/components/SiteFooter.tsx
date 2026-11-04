import Link from 'next/link';
import type { TopCategory } from '@/modules/catalog/api';

export function SiteFooter({ categories }: { categories: TopCategory[] }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__cols">
          <div>
            <div className="footer__title">购物指南</div>
            <span className="footer__link">购物流程</span>
            <span className="footer__link">会员制度</span>
            <span className="footer__link">常见问题</span>
          </div>
          <div>
            <div className="footer__title">配送方式</div>
            <span className="footer__link">上门自提</span>
            <span className="footer__link">配送费用</span>
            <span className="footer__link">配送范围</span>
          </div>
          <div>
            <div className="footer__title">热门类目</div>
            {categories.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                className="footer__link"
                href={`/search?category=${encodeURIComponent(c.name)}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <div className="footer__title">客户服务</div>
            <span className="footer__link">售后政策</span>
            <span className="footer__link">价格保护</span>
            <span className="footer__link">取消订单</span>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} 朱瓦商城 · 示例站点，商品与价格均为演示数据</span>
          <span>客服热线 400-000-0000（演示）</span>
        </div>
      </div>
    </footer>
  );
}
