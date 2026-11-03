package com.zhuawa.shop.search.rabbitmq;

import com.zhuawa.shop.common.rabbitmq.CanalMessage;
import com.zhuawa.shop.common.rabbitmq.OperationType;
import com.zhuawa.shop.common.utils.BeanUtil;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.search.dao.GoodsEsDao;
import com.zhuawa.shop.search.model.GoodsEsInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MQReceiver {
    private static final Logger logger = LoggerFactory.getLogger(MQReceiver.class);

    @Autowired
    GoodsEsDao goodsEsDao;

    @Autowired
    GoodsApi goodsApi;

    @RabbitListener(queues=MQConfig.CANAL_QUEUE)
    public void receiveCanalMsg(String message) {
        logger.info("receive message:"+message);
        CanalMessage canalMessage = BeanUtil.stringToBean(message, CanalMessage.class);
        if (canalMessage.getOperationType() == OperationType.DELETE) {
            goodsEsDao.deleteById(canalMessage.getPrimaryKey());
        } else {
            goodsEsDao.save(new GoodsEsInfo(goodsApi.get(canalMessage.getPrimaryKey()).getData()));
        }
    }
}
