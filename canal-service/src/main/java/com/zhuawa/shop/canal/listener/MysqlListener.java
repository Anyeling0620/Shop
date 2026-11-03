package com.zhuawa.shop.canal.listener;

import com.alibaba.otter.canal.protocol.CanalEntry;
import com.xpand.starter.canal.annotation.CanalEventListener;
import com.xpand.starter.canal.annotation.ListenPoint;
import com.zhuawa.shop.canal.rabbitmq.MQSender;
import com.zhuawa.shop.common.rabbitmq.CanalMessage;
import com.zhuawa.shop.common.rabbitmq.OperationType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

@CanalEventListener
public class MysqlListener {

    private static final Logger logger = LoggerFactory.getLogger(MysqlListener.class);

    @Autowired
    MQSender sender;

    @ListenPoint(destination = "example", schema = "goods", table = {"goods"}, eventType = {CanalEntry.EventType.UPDATE, CanalEntry.EventType.INSERT, CanalEntry.EventType.DELETE})
    public void onGoodsUpdate(CanalEntry.EventType eventType, CanalEntry.RowData rowData) {
        if (eventType == CanalEntry.EventType.DELETE) {
            // 删除记录
            List<CanalEntry.Column> beforeColumnsList = rowData.getBeforeColumnsList();
            for (CanalEntry.Column column : beforeColumnsList) {
                //column.getName(列的名称   column.getValue() 列对应的值
                if (column.getName().equals("id")) {
                    logger.info("delete id {}", column.getValue());
                    sender.sendCanalMessage(new CanalMessage("goods", "goods", Long.parseLong(column.getValue()), OperationType.DELETE));
                }
            }
        } else {
            // 新增或者修改记录
            List<CanalEntry.Column> beforeColumnsList = rowData.getAfterColumnsList();
            for (CanalEntry.Column column : beforeColumnsList) {
                //column.getName(列的名称   column.getValue() 列对应的值
                if (column.getName().equals("id")) {
                    logger.info("insert or update id {}", column.getValue());
                    if (eventType == CanalEntry.EventType.INSERT) {
                        sender.sendCanalMessage(new CanalMessage("goods", "goods", Long.parseLong(column.getValue()), OperationType.ADD));
                    }else {
                        sender.sendCanalMessage(new CanalMessage("goods", "goods", Long.parseLong(column.getValue()), OperationType.UPDATE));
                    }
                }
            }
        }
    }
}
