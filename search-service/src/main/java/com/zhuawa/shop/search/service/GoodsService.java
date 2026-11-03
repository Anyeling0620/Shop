package com.zhuawa.shop.search.service;

import com.alibaba.fastjson.JSONObject;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.search.dao.GoodsEsDao;
import com.zhuawa.shop.search.model.GoodsEsInfo;
import com.zhuawa.shop.search.model.SearchGoodsParam;
import com.zhuawa.shop.search.model.SearchGoodsRes;
import org.apache.commons.lang.StringUtils;
import org.elasticsearch.index.query.BoolQueryBuilder;
import org.elasticsearch.index.query.Operator;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.index.query.RangeQueryBuilder;
import org.elasticsearch.search.aggregations.AggregationBuilders;
import org.elasticsearch.search.aggregations.bucket.terms.ParsedStringTerms;
import org.elasticsearch.search.aggregations.bucket.terms.Terms;
import org.elasticsearch.search.fetch.subphase.highlight.HighlightBuilder;
import org.elasticsearch.search.sort.SortBuilder;
import org.elasticsearch.search.sort.SortBuilders;
import org.elasticsearch.search.sort.SortOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.NativeSearchQuery;
import org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class GoodsService {

    @Autowired
    GoodsEsDao goodsEsDao;

    @Autowired
    GoodsApi goodsApi;

    @Autowired
    private ElasticsearchRestTemplate elasticsearchRestTemplate;

    public void exportData2ES() {
        List<Goods> goodsList = goodsApi.getAllValidGoods().getData();
        List<GoodsEsInfo> goodsEsInfoList = new ArrayList<>();
        for (Goods g : goodsList) {
            goodsEsInfoList.add(new GoodsEsInfo(g));
        }
        goodsEsDao.saveAll(goodsEsInfoList);
    }

    /***
     *
     * @param params 查询条件map
     * {
     *     "key": "关键词", // 关键词查询， 搜索 商品名称， 类目， 品牌
     *     "category": "类目名称",
     *     "brand": "品牌名称",
     *     "specs_规格name": "规格名称",
     *     "min_price": "0", // 0
     *     "max_price": "100", // <=0 表示没有约束
     *     "orderField": "排序字段",
     *     "orderType": "排序方式" // asc, desc
     * }
     * @return
     */
    public SearchGoodsRes search(SearchGoodsParam params, int page, int size) {
        SearchGoodsRes res = new SearchGoodsRes();

        NativeSearchQueryBuilder nativeSearchQueryBuilder = new NativeSearchQueryBuilder();

        // 分组汇总 类目，品牌，规格
        // 把es 可以想象成 mysql的表查询 ， select category_name from goods where name like "%***%" group by category_name;

        // 类目 List
        nativeSearchQueryBuilder.addAggregation(AggregationBuilders.terms("goodsCategory").field("categoryName.keyword").size(100));

        // 品牌 List
        nativeSearchQueryBuilder.addAggregation(AggregationBuilders.terms("goodsBrand").field("brandName").size(100));

        // 规格 Map<String, Set<String>> 搜索 specsJson, 注意不需要分词 使用 keyword
        nativeSearchQueryBuilder.addAggregation(AggregationBuilders.terms("goodsSpecs").field("specsJson").size(10000));

        BoolQueryBuilder boolQueryBuilder = new BoolQueryBuilder();

        //  关键词搜索
        if (params.getKey() != null) {
            boolQueryBuilder.must(QueryBuilders.multiMatchQuery(params.getKey(), "name", "categoryName", "brandName")); // 分词之后 或者 的关系
            boolQueryBuilder.should(QueryBuilders.matchQuery("fullName", params.getKey()).operator(Operator.AND)); // 全包含的排在前面
        }

        //TODO 点击一个类目， 品牌， 规格之后就不需要再显示相应的列表了
        if (StringUtils.isNotEmpty(params.getCategory())) {
            res.setCategory(params.getCategory());
            boolQueryBuilder.filter(QueryBuilders.termQuery("categoryName", params.getCategory()));
        }
        if (StringUtils.isNotEmpty(params.getBrand())) {
            res.setBrand(params.getBrand());
            boolQueryBuilder.filter(QueryBuilders.termQuery("brandName", params.getBrand()));
        }
        if (params.getSpecsValueMap() != null) {
            res.setSpecsValueMap(params.getSpecsValueMap());
            for (Map.Entry<String, String> entry: params.getSpecsValueMap().entrySet()) {
                boolQueryBuilder.filter(QueryBuilders.termQuery("specsMap."+entry.getKey()+".keyword", entry.getValue()));
            }
        }

        // 价格范围
        RangeQueryBuilder rangeQueryBuilder = new RangeQueryBuilder("price");
        rangeQueryBuilder.gte(params.getMinPrice());
        if (params.getMaxPrice() > 0) {
            rangeQueryBuilder.lte(params.getMaxPrice());
        }

        boolQueryBuilder.must(rangeQueryBuilder);

        // 分页查询
        PageRequest pageRequest = PageRequest.of(page - 1, size);

        // 排序
        SortBuilder sortBuilder = SortBuilders.scoreSort();
        if (StringUtils.isNotEmpty(params.getOrderField()) && StringUtils.isNotEmpty(params.getOrderType())
                && (params.getOrderType().equalsIgnoreCase("asc") || params.getOrderType().equalsIgnoreCase("desc"))) {
            sortBuilder = SortBuilders.fieldSort(params.getOrderField());
            sortBuilder.order(SortOrder.fromString(params.getOrderType()));
        }

        // 高亮显示
        HighlightBuilder highlightBuilder = new HighlightBuilder();
        //设置高亮的字段， 前缀 和 后缀
        highlightBuilder.field("name").preTags("<font color='red'>").postTags("</font>")
                .field("categoryName").preTags("<font color='red'>").postTags("</font>")
                .field("brandName").preTags("<font color='red'>").postTags("</font>");

        NativeSearchQuery searchQuery = nativeSearchQueryBuilder
                .withQuery(boolQueryBuilder)
                .withPageable(pageRequest)
                .withSort(sortBuilder)
                .withHighlightBuilder(highlightBuilder)
                .build();

        SearchHits<GoodsEsInfo> goodsEsInfoSearchHits = elasticsearchRestTemplate.search(searchQuery, GoodsEsInfo.class); // 执行搜索

        // 结果构造
        List<String> categoryNames = null;
        if (StringUtils.isEmpty(params.getCategory())) { // 没有明确指定类目， 才需要显示类目筛选项
            categoryNames = new ArrayList<>();
            ParsedStringTerms goodsCategoryAggregation = goodsEsInfoSearchHits.getAggregations().get("goodsCategory"); // 获取类目汇总结果
            for (Terms.Bucket bucket: goodsCategoryAggregation.getBuckets()) {
                categoryNames.add(bucket.getKeyAsString());
            }
        }

        List<String> brandNames = null;
        if (StringUtils.isEmpty(params.getBrand())) { // 没有明确指定品牌，才需要显示品牌筛选项
            ParsedStringTerms goodsBrandAggregation = goodsEsInfoSearchHits.getAggregations().get("goodsBrand"); // 获取品牌汇总结果
            brandNames = new ArrayList<>();
            for (Terms.Bucket bucket : goodsBrandAggregation.getBuckets()) {
                brandNames.add(bucket.getKeyAsString());
            }
        }

        ParsedStringTerms goodsSpecsAggregation = goodsEsInfoSearchHits.getAggregations().get("goodsSpecs"); // 获取规格汇总结果
        Map<String, Set<String>> specsRes = new HashMap<>();
        for (Terms.Bucket bucket : goodsSpecsAggregation.getBuckets()) {
            JSONObject specsJsonObj = JSONObject.parseObject(bucket.getKeyAsString());
            for (Map.Entry<String, Object> specsEntry : specsJsonObj.entrySet()) {
                if (params.getSpecsValueMap() != null && params.getSpecsValueMap().containsKey(specsEntry.getKey())) {
                    continue; // 明确指定了特定规格， 就不需要显示筛选项了
                }
                Set<String> specsOptions = specsRes.get(specsEntry.getKey());
                if (specsOptions == null) {
                    specsOptions = new HashSet<>();
                }
                specsOptions.add((String) specsEntry.getValue());
                specsRes.put(specsEntry.getKey(), specsOptions);
            }
        }

        List<GoodsEsInfo> rows = new ArrayList<>();

        for (SearchHit<GoodsEsInfo> searchHit : goodsEsInfoSearchHits) {
            GoodsEsInfo goodsEsInfo = searchHit.getContent();
            // 获取高亮结果
            List<String> nameList = searchHit.getHighlightField("name");
            if (nameList.size() > 0) {
                String nameHighlight = nameList.get(0);
                goodsEsInfo.setName(nameHighlight);
            }
            List<String> categoryNameList = searchHit.getHighlightField("categoryName");
            if (categoryNameList.size() > 0) {
                goodsEsInfo.setCategoryName(categoryNameList.get(0));
            }
            List<String> brandNameList = searchHit.getHighlightField("brandName");
            if (brandNameList.size() > 0) {
                goodsEsInfo.setBrandName(brandNameList.get(0));
            }
            rows.add(goodsEsInfo);
        }
        long totalSize = goodsEsInfoSearchHits.getTotalHits();
        long pages = totalSize / size + (totalSize % size > 0 ? 1 : 0);
        res.setPage(page);
        res.setTotal(totalSize);
        res.setTotalPages(pages);
        res.setGoodsEsInfoList(rows);
        res.setCategoryList(categoryNames);
        res.setBrandList(brandNames);
        res.setSpecsList(specsRes);
        return res;
    }
}
