package com.zhuawa.shop.order.service;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.order.dao.CartItemDao;
import com.zhuawa.shop.order.model.CartItem;
import com.zhuawa.shop.order.vo.CartItemVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class CartService {

    private static final Logger log = LoggerFactory.getLogger(CartService.class);

    @Autowired
    CartItemDao cartItemDao;

    @Autowired
    GoodsApi goodsApi;

    public void incr(long userId, long goodsId) {
        CartItem cartItem = new CartItem(userId, goodsId);
        CartItem ctDB = cartItemDao.selectOne(cartItem);
        if (ctDB == null) {
            setCount(userId, goodsId, 1);
            return;
        }
        setCount(userId, goodsId, ctDB.getCount() + 1);
    }

    public void decr(long userId, long goodsId) {
        CartItem cartItem = new CartItem(userId, goodsId);
        CartItem ctDB = cartItemDao.selectOne(cartItem);
        if (ctDB == null) {
            return;
        }
        setCount(userId, goodsId, ctDB.getCount() - 1);
    }

    public void setCount(long userId, long goodsId, int count) {
        CartItem cartItem = new CartItem();
        cartItem.setUserId(userId);
        cartItem.setGoodsId(goodsId);
        if (count <= 0) {
            cartItemDao.delete(cartItem);
        }
        CartItem cartItemDB = cartItemDao.selectOne(cartItem);
        if (cartItemDB == null) {
            Result<Goods> goodsResult = goodsApi.get(goodsId);
            Goods goods = goodsResult.getData();
            if (goods != null) {
                cartItem.setCount(count);
                cartItem.setPrice(goods.getPrice());
            }
            cartItemDao.insertSelective(cartItem);
        } else {
            cartItemDB.setCount(count);
            cartItemDB.setUpdateTime(new Date());
            cartItemDao.updateByPrimaryKey(cartItemDB);
        }
    }

    public List<CartItemVO> list(long userId) {
        CartItem cartItem = new CartItem();
        cartItem.setUserId(userId);
        List<CartItemVO> cartItemVOS = new ArrayList<>();
        List<CartItem> cartItems = cartItemDao.select(cartItem);
        if (cartItems == null || cartItems.isEmpty()) {
            // 空购物车直接返回，不发一次空的 Feign 请求
            return cartItemVOS;
        }

        // 一次性批量取商品：收集去重后的 goodsId（判 null、跳过 null）
        Set<Long> goodsIdSet = new LinkedHashSet<>();
        for (CartItem ct : cartItems) {
            if (ct.getGoodsId() != null) {
                goodsIdSet.add(ct.getGoodsId());
            }
        }
        Map<Long, Goods> goodsMap = new HashMap<>();
        if (!goodsIdSet.isEmpty()) {
            try {
                Result<Map<Long, Goods>> goodsResult = goodsApi.getByIds(new ArrayList<>(goodsIdSet));
                if (goodsResult != null && goodsResult.getData() != null) {
                    goodsMap = goodsResult.getData();
                }
            } catch (Exception e) {
                // 降级：商品服务不可用时，购物车列表仍然要能返回，只是缺 image/title/价格
                log.warn("goodsApi.getByIds failed, degrade to empty goods map, goodsIds={}", goodsIdSet, e);
                goodsMap = new HashMap<>();
            }
        }

        for (CartItem ct: cartItems) {
            CartItemVO cartItemVO = new CartItemVO(ct);
            Goods goods = goodsMap.get(ct.getGoodsId());
            if (goods != null) {
                cartItemVO.setImage(goods.getImage());
                cartItemVO.setTitle(goods.getName());
                cartItemVO.setPriceNow(goods.getPrice());
                cartItemVO.setTotalPriceNow(goods.getPrice() * ct.getCount());
            }
            cartItemVOS.add(cartItemVO);
        }
        return cartItemVOS;
    }

}
