import Link from 'next/link';
import type { Goods } from '@/modules/catalog/types';
import { formatPrice, goodsImageSrc, sanitizeHighlight } from '@/lib/format/display';

interface Props {
  goods: Goods;
  /** 搜索结果里 name 可能带 <font> 高亮 */
  highlighted?: boolean;
  href?: string;
}

export function GoodsCard({ goods, highlighted = false, href }: Props) {
  const target = href ?? `/goods/${goods.id}`;
  const name = highlighted ? sanitizeHighlight(goods.name) : goods.name;

  return (
    <article className="card">
      <Link href={target} className="card__media" aria-label={goods.name}>
        {/* 后端图片是商品图，SSR 直出 <img> 让爬虫也能拿到，不用 next/image 的懒加载 */}
        <img src={goodsImageSrc(goods.image)} alt={goods.name} loading="lazy" width={300} height={300} />
      </Link>
      <div className="card__body">
        <Link href={target}>
          {highlighted ? (
            <h3 className="card__name" dangerouslySetInnerHTML={{ __html: name }} />
          ) : (
            <h3 className="card__name">{name}</h3>
          )}
        </Link>
        <div className="card__foot">
          <span className="price">{formatPrice(goods.price)}</span>
          <span className="card__stock">{goods.brandName}</span>
        </div>
      </div>
    </article>
  );
}
