package com.zhuawa.shop.order.service;

import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.common.utils.IdWorker;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.order.dao.CartItemDao;
import com.zhuawa.shop.order.dao.OrderItemDao;
import com.zhuawa.shop.order.dao.OrdersDao;
import com.zhuawa.shop.order.model.CartItem;
import com.zhuawa.shop.order.model.OrderItem;
import com.zhuawa.shop.order.model.Orders;
import com.zhuawa.shop.order.vo.OrderVO;
import com.zhuawa.shop.order.vo.OrdersParam;
import com.zhuawa.shop.user.api.UserApi;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tk.mybatis.mapper.entity.Example;

@Service
public class OrderService {

    @Autowired
    OrdersDao ordersDao;

    @Autowired
    OrderItemDao orderItemDao;

    @Autowired
    CartItemDao cartItemDao;

    @Autowired
    GoodsApi goodsApi;

    @Autowired
    UserApi userApi;

    @Autowired
    IdWorker idWorker;

    public Orders genOrder(long userId, OrdersParam ordersParam) {
        Orders orders = new Orders();
        long orderId = idWorker.nextId(); // id - IdWorker 生成, 不需要等插入数据库
        orders.setId(orderId);
        orders.setUserId(userId);
        orders.setReceiveAddress(ordersParam.getReceiveAddress());
        orders.setPayType(ordersParam.getPayType());
        orders.setConsumerMsg(ordersParam.getConsumerMsg());

        // calculate total price
        long totalPrice = 0; // 注意： 总金额需要在后台完善
        Example example = new Example(CartItem.class);
        Example.Criteria criteria = example.createCriteria();
        for (long cartItemId: ordersParam.getCartItemIds()) {
            OrderItem orderItem = new OrderItem();
            orderItem.setId(idWorker.nextId());
            orderItem.setCartItemId(cartItemId);
            orderItem.setOrderId(orderId); // one reason of using idworker
            CartItem cartItem = cartItemDao.selectByPrimaryKey(cartItemId);
            orderItem.setGoodsId(cartItem.getGoodsId());
            orderItem.setUserId(userId);
            orderItem.setCount(cartItem.getCount());
            Result<Goods> goodsResult = goodsApi.get(cartItem.getGoodsId());
            Goods goods = goodsResult.getData();
            if (goods == null) {
                throw new GlobalException(CodeMsg.GOODS_NOT_EXIST);
            }
            long orderItemPrice = goods.getPrice() * cartItem.getCount();
            orderItem.setPrice(orderItemPrice);
            orderItem.setDiscountPrice(0L);
            orderItem.setActualPrice(orderItemPrice);
            orderItem.setGoodsName(goods.getName());
            orderItem.setGoodsImage(goods.getImage());

            // decr goods stock
            // 超卖： 并发情况下库存不够问题， 两个请求同时到这里， 解决（行级锁）：update goods set stock = stock - num where id = ? and stock >= num
            Result<String> decrResult = goodsApi.decrStock(cartItem.getGoodsId(), cartItem.getCount());
            if (decrResult.getCode() != CodeMsg.SUCCESS.getCode()) {
                throw new GlobalException(CodeMsg.GOODS_STOCK_LIMIT);
            }

            // add to order_item table(need rollback when failed or add to tmp list then insert at last)
            orderItemDao.insertSelective(orderItem);

            totalPrice += orderItemPrice;
            criteria.orEqualTo("id", cartItemId); //to delete cartItem
        }

        //TODO if distributed transaction necessary?

        // add user point
        userApi.addPoint(userId, (int)(totalPrice/10) + 1);

        // delete cart items
        cartItemDao.deleteByExample(example);

        // insert into orders table
        orders.setTotalPrice(totalPrice);
        orders.setDiscountPrice(0L);
        orders.setActualPrice(totalPrice);
        ordersDao.insertSelective(orders);
        return orders;
    }

    public OrderVO getOrderById(long orderId) {
        OrderVO orderVO = ordersDao.selectVOById(orderId);
        OrderItem orderItem = new OrderItem();
        orderItem.setOrderId(orderId);
        orderVO.setOrderItems(orderItemDao.select(orderItem));
        return orderVO;
    }
}
