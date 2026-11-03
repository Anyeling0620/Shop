package com.zhuawa.shop.common.rabbitmq;

public class CanalMessage {
    private String schema;
    private String table;
    private Long primaryKey;
    private OperationType operationType;

    public CanalMessage() {
    }

    public CanalMessage(String schema, String table, Long primaryKey, OperationType operationType) {
        this.schema = schema;
        this.table = table;
        this.primaryKey = primaryKey;
        this.operationType = operationType;
    }

    public String getSchema() {
        return schema;
    }

    public void setSchema(String schema) {
        this.schema = schema;
    }

    public String getTable() {
        return table;
    }

    public void setTable(String table) {
        this.table = table;
    }

    public Long getPrimaryKey() {
        return primaryKey;
    }

    public void setPrimaryKey(Long primaryKey) {
        this.primaryKey = primaryKey;
    }

    public OperationType getOperationType() {
        return operationType;
    }

    public void setOperationType(OperationType operationType) {
        this.operationType = operationType;
    }
}
