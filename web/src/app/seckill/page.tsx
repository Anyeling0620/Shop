import type { Metadata } from 'next';
import Link from 'next/link';
import { getSeckillList } from '@/modules/seckill/api';
import { SeckillCard } from '@/modules/seckill/SeckillCard';
import { groupSessionsByGoods, sortGroupsForList } from '@/modules/seckill/utils';

export const metadata: Metadata = {
  title: '限时秒杀',
  description: '朱瓦商城限时秒杀专场，每日整点开抢，库存有限先到先得。',
  alternates: { canonical: '/seckill' },
};

/**
 * 关于缓存：`getSeckillList()` 走 `backendRequest` 时未传 `revalidate`，
 * 底层落到 `cache: 'no-store'`，因此本页实际是**动态渲染**，本声明并不产生
 * 30 秒快照缓存（这是改造前就存在的仓库级现象，非本次引入；也不打算为此改动
 * 公共 request 层，那会牵动首页其它数据源）。
 *
 * 即便如此，状态文案仍然一律交给客户端按本机时钟计算（R-DEF-01）：
 * 不依赖「缓存到底有没有生效」这种易变前提，是更稳的做法。
 */
export const revalidate = 30;

export default async function SeckillPage() {
  const list = await getSeckillList();

  // 聚合与选场是确定性计算：同一份数据 + 同一渲染时刻 → 同一结果。
  // 这里的结果只用于 **SSR 首帧**；卡片会在客户端按本机时钟重新选场（见 SeckillCard）。
  const renderNow = Date.now();
  const groups = sortGroupsForList(groupSessionsByGoods(list, renderNow), renderNow);

  // R-LIST-07 聚合后置校验：卡片数必须等于 (goodsId, sessionId) 去重数
  const keys = new Set(groups.map((g) => `${g.goodsId}:${g.picked.sessionId}`));
  if (groups.length !== keys.size) {
    console.error('[seckill] 聚合异常：出现重复的 (goodsId, sessionId) key', {
      cards: groups.length,
      uniqueKeys: keys.size,
    });
  }

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>限时秒杀</span>
      </nav>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section__head">
          <h1 className="section__title">限时秒杀</h1>
          {/* R-LIST-08：计数用聚合后的商品数，不是 (商品,场次) 记录数 */}
          <span className="section__more">共 {groups.length} 款</span>
        </div>

        {groups.length > 0 ? (
          <div className="seckill-row">
            {groups.map(({ goodsId, picked, allSessions }, index) => (
              <SeckillCard
                // R-LIST-06：key 用服务端选出的 (goodsId, sessionId)，与库层 uk_goods_session 同构。
                // 客户端重选场后 key 不变——它标识的是「这张卡属于哪个商品」，不是「当前显示哪一场」；
                // 若用 sessionId 做 key，切场会导致整卡卸载重建、图片重新加载。
                key={`${goodsId}:${picked.sessionId}`}
                goods={picked.goods}
                // A3(a)：下发全部候选场次，由客户端按本机时钟重新选场
                allSessions={allSessions}
                // 不传 serverStatus：本页没有可信的服务端状态基线，首帧给中性占位
                eager={index < 4}
              />
            ))}
          </div>
        ) : (
          <p className="empty">当前没有秒杀商品。请确认 seckill 服务已启动且已上架商品。</p>
        )}
      </section>
    </div>
  );
}
