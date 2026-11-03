//package com.zhuawa.shop.canal.handler;
//
//import com.zhuawa.shop.goods.model.Goods;
//import org.slf4j.Logger;
//import org.slf4j.LoggerFactory;
//import org.springframework.stereotype.Component;
//import top.javatool.canal.client.annotation.CanalTable;
//import top.javatool.canal.client.handler.EntryHandler;
//
//@CanalTable(value = "goods.goods")
//@Component
//public class GoodsHandler implements EntryHandler<Goods> {
//
//    private static final Logger logger = LoggerFactory.getLogger(GoodsHandler.class);
//
//    @Override
//    public void update(Goods before, Goods after) {
//        logger.info("update before {} ", before);
//        logger.info("update after {}", after);
//    }
//
//    @Override
//    public void insert(Goods goods) {
//        logger.info("insert goods: {}", goods);
//    }
//}
