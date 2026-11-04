/** 类目（goods-service /category） */
export interface Category {
  id: number;
  name: string;
  parentId: number;
  templateId?: number | null;
  createTime?: string;
  updateTime?: string;
}

/** 品牌（goods-service /brand） */
export interface Brand {
  id: number;
  name: string;
  beginLetter?: string;
  createTime?: string;
  updateTime?: string;
}

/** 商品（goods-service /goods，价格单位为分） */
export interface Goods {
  id: number;
  name: string;
  price: number;
  stock: number;
  image: string;
  brandId: number;
  categoryId: number;
  brandName: string;
  categoryName: string;
  paramJson?: string;
  specsJson?: string;
  status: number;
  createTime?: string;
  updateTime?: string;
}

/** ES 搜索结果里的商品（比 Goods 多了 fullName / specsMap） */
export interface GoodsEsInfo extends Goods {
  fullName?: string;
  specsMap?: Record<string, string>;
}

/** 搜索结果（search-service） */
export interface SearchResult {
  goodsEsInfoList: GoodsEsInfo[];
  categoryList: string[] | null;
  brandList: string[] | null;
  specsList: Record<string, string[]>;
  category: string | null;
  brand: string | null;
  specsValueMap: Record<string, string> | null;
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchParams {
  key?: string | null;
  category?: string;
  brand?: string;
  specsValueMap?: Record<string, string>;
  minPrice?: number;
  maxPrice?: number;
  orderField?: string;
  orderType?: 'asc' | 'desc' | '';
}

/** 秒杀商品（seckill-service，price 为元，BigDecimal） */
export interface SeckillGoods {
  goodsId: number;
  name: string;
  title: string;
  img: string;
  detail: string;
  price: number;
  stock: number;
  priceSeckill: number;
  stockSeckill: number;
  startTime: string;
  endTime: string;
}

/** 秒杀详情 */
export interface SeckillDetail {
  goods: SeckillGoods;
  /** 0 未开始 1 进行中 2 已结束 */
  seckillStatus: number;
  /** 距开始秒数，-1 表示已结束 */
  remainSeconds: number;
}

/** 购物车项 */
export interface CartItem {
  itemId: number;
  image: string;
  title: string;
  priceOrigin: number;
  priceNow: number;
  count: number;
  totalPriceOrigin: number;
  totalPriceNow: number;
}

/** 订单项 */
export interface OrderItem {
  id: number;
  orderId: number;
  goodsId: number;
  goodsName: string;
  goodsImage: string;
  userId: number;
  count: number;
  price: number;
  discountPrice: number;
  actualPrice: number;
  cartItemId: number;
}

/** 订单 */
export interface Order {
  id: number;
  userId: number;
  receiveAddress: string;
  payType: number;
  consumerMsg: string;
  totalPrice: number;
  discountPrice: number;
  actualPrice: number;
  status?: number;
  createTime?: string;
  orderItems?: OrderItem[];
}

/** 当前登录用户 */
export interface ShopUser {
  id: number;
  mobile: string;
  nickname: string;
  avatar?: string | null;
  point?: number;
}
