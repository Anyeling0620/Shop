package com.zhuawa.shop.search.dao;

import com.zhuawa.shop.search.model.GoodsEsInfo;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

public interface GoodsEsDao extends ElasticsearchRepository<GoodsEsInfo, Long> {
}
