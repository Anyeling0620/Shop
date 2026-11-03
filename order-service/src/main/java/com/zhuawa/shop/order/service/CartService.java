package com.zhuawa.shop.order.service;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.order.dao.CartItemDao;
import com.zhuawa.shop.order.model.CartItem;
import com.zhuawa.shop.order.vo.CartItemVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Service
public class CartService {

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
        for (CartItem ct: cartItems) {
            CartItemVO cartItemVO = new CartItemVO(ct);
            Result<Goods> goodsResult = goodsApi.get(ct.getGoodsId());
            Goods goods = goodsResult.getData();
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
