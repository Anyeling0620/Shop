package com.zhuawa.shop.goods.service;

import com.alibaba.fastjson.JSONObject;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.utils.IdWorker;
import com.zhuawa.shop.goods.dao.BrandDao;
import com.zhuawa.shop.goods.dao.CategoryDao;
import com.zhuawa.shop.goods.dao.GoodsDao;
import com.zhuawa.shop.goods.dao.SpecsDao;
import com.zhuawa.shop.goods.model.Brand;
import com.zhuawa.shop.goods.model.Category;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.goods.model.Specs;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tk.mybatis.mapper.entity.Example;

import java.util.*;

@Service
public class GoodsService {

    @Autowired
    GoodsDao goodsDao;

    @Autowired
    CategoryDao categoryDao;

    @Autowired
    BrandDao brandDao;

    @Autowired
    SpecsDao specsDao;

    @Autowired
    IdWorker idWorker;

    public List<Goods> genMockGoodsByName(String baseName, Long categoryId, Long brandId, Long stock, Long minPrice, Long maxPrice) {
        Category category = categoryDao.selectByPrimaryKey(categoryId);
        Brand brand = brandDao.selectByPrimaryKey(brandId);
        String img = "/img/HuaweiMateX2.jpeg"; // 临时就用一张图片， 在真正的项目里会用到云存储工具，比如 阿里云的OSS等，直接看文档调用api就可以了
        Example example = new Example(Specs.class);
        Example.Criteria criteria = example.createCriteria();
        criteria.andEqualTo("templateId", category.getTemplateId());
        List<Specs> specsList = specsDao.selectByExample(example); // 获取类目对应模板的规格列表
        List<String> fullNames = genGoodsFullName(0, specsList);
        List<Goods> res = new ArrayList<>();
        for (String fullName : fullNames) {
            Goods goods = new Goods();
            goods.setId(idWorker.nextId()); // 使用雪花算法生成分库分表唯一id
            goods.setName(baseName + " " + fullName);
            goods.setPrice(minPrice + (long) (Math.random()*(maxPrice - minPrice)));
            goods.setStock(stock);
            goods.setImage(img);
            goods.setBrandId(brandId);
            goods.setBrandName(brand.getName());
            goods.setCategoryId(categoryId);
            goods.setCategoryName(category.getName());
            goods.setParamJson("");
            JSONObject specsJson = new JSONObject();
            String[] fullNameSplits = fullName.split(";");
            for (int i = 0; i < specsList.size(); i++) {
                specsJson.put(specsList.get(i).getName(), fullNameSplits[i]);
            }
            goods.setSpecsJson(specsJson.toJSONString());
            res.add(goods);
            goodsDao.insertSelective(goods);

        }
        return res;
    }

    private List<String> genGoodsFullName(int startLineNum, List<Specs> specsList) {
        List<String> res = new ArrayList<>();
        if (startLineNum == specsList.size() - 1) {
            res.addAll(Arrays.asList(specsList.get(startLineNum).getOptions().split(",")));
            return res;
        }
        String[] specOptions = specsList.get(startLineNum).getOptions().split(",");
        List<String> subRes = genGoodsFullName(startLineNum + 1, specsList);
        for (String option : specOptions) {
            for (String subName : subRes) {
                res.add(option + ";" + subName);
            }
        }
        return res;
    }

    public List<Goods> getGoodsByStatus(int status) {
        Goods goods = new Goods();
        goods.setStatus(status);
        return goodsDao.select(goods); // 查找 状态正常的 商品列表
    }

    public Goods getGoodsById(long id) {
        return goodsDao.selectByPrimaryKey(id);
    }

    public void decrStock(long id, int count) {
        if (goodsDao.decrStock(count, id) <= 0) {
            throw new GlobalException(CodeMsg.GOODS_STOCK_LIMIT);
        }
    }


}
