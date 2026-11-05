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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
        List<Long> cartItemIds = ordersParam.getCartItemIds();

        // 批量取 CartItem（原来循环内 selectByPrimaryKey 是 N 次 DB 查询）
        // 注意：cartItemIds 为空时不做批量查询（andIn 空集合会拼出非法 SQL），
        // 空的 cartItemIds 会让下面的循环不执行、criteria 没有任何条件，
        // 从而 deleteByExample 无 where 条件 —— 这是改造前就存在的既有行为，
        // 本次不擅自修改，仅在报告中作为安全隐患上报。
        Map<Long, CartItem> cartItemMap = new HashMap<>();
        if (cartItemIds != null && !cartItemIds.isEmpty()) {
            Example cartItemExample = new Example(CartItem.class);
            cartItemExample.createCriteria().andIn("id", cartItemIds);
            List<CartItem> cartItemList = cartItemDao.selectByExample(cartItemExample);
            if (cartItemList != null) {
                for (CartItem ci : cartItemList) {
                    cartItemMap.put(ci.getId(), ci);
                }
            }
        }

        // 批量取 Goods（原来循环内 goodsApi.get 是 N 次 Feign 调用）
        // 这里不做降级：下单场景价格必须准确，Feign 异常直接向上抛。
        Set<Long> goodsIdSet = new LinkedHashSet<>();
        for (CartItem ci : cartItemMap.values()) {
            if (ci.getGoodsId() != null) {
                goodsIdSet.add(ci.getGoodsId());
            }
        }
        Map<Long, Goods> goodsMap = new HashMap<>();
        if (!goodsIdSet.isEmpty()) {
            Result<Map<Long, Goods>> goodsResult = goodsApi.getByIds(new ArrayList<>(goodsIdSet));
            if (goodsResult != null && goodsResult.getData() != null) {
                goodsMap = goodsResult.getData();
            }
        }

        for (long cartItemId: cartItemIds) {
            OrderItem orderItem = new OrderItem();
            orderItem.setId(idWorker.nextId()); // 每条 orderItem 都新生成一个 id，保持原样
            orderItem.setCartItemId(cartItemId);
            orderItem.setOrderId(orderId); // one reason of using idworker
            CartItem cartItem = cartItemMap.get(cartItemId);
            // cartItem 为 null（DB 中查不到该 id）时，下一行 getGoodsId() 会 NPE ——
            // 与原实现 selectByPrimaryKey 返回 null 后直接 getGoodsId() 的行为完全一致，
            // 这里刻意不引入新的业务异常语义。
            orderItem.setGoodsId(cartItem.getGoodsId());
            orderItem.setUserId(userId);
            orderItem.setCount(cartItem.getCount());
            Goods goods = goodsMap.get(cartItem.getGoodsId());
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
            // 注意：decrStock 故意保持循环内逐条调用，因为它需要每条独立的成功/失败判定
            // （update ... where id = ? and stock >= num），改成批量 UPDATE 会破坏
            // “某一条失败就抛异常”的语义。
            // 超卖： 并发情况下库存不够问题， 两个请求同时到这里， 解决（行级锁）：update goods set stock = stock - num where id = ? and stock >= num
            Result<String> decrResult = goodsApi.decrStock(cartItem.getGoodsId(), cartItem.getCount());
            if (decrResult.getCode() != CodeMsg.SUCCESS.getCode()) {
                throw new GlobalException(CodeMsg.GOODS_STOCK_LIMIT);
            }

            // add to order_item table(need rollback when failed or add to tmp list then insert at last)
            // 保持逐条插入，不做批量插入（避免改变事务/回滚语义）
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
