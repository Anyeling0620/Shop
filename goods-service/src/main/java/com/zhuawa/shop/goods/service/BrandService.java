package com.zhuawa.shop.goods.service;

import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.goods.dao.BrandDao;
import com.zhuawa.shop.goods.dao.CategoryBrandDao;
import com.zhuawa.shop.goods.model.Brand;
import com.zhuawa.shop.goods.model.CategoryBrand;
import org.apache.commons.lang.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tk.mybatis.mapper.entity.Example;

import java.io.*;
import java.util.*;

@Service
public class BrandService {

    private static Logger logger = LoggerFactory.getLogger(BrandService.class);

    @Autowired
    BrandDao brandDao;

    @Autowired
    CategoryBrandDao categoryBrandDao;

    public Brand getById(long id) {
        return brandDao.selectByPrimaryKey(id);
    }

    public Long add(Brand brand) {
        try {
            brandDao.insertSelective(brand);
        } catch (Exception e) {
            logger.error("add brand error: ", e);
            throw new GlobalException(CodeMsg.GOODS_ADD_BRAND_ERROR);
        }
        return brand.getId();
    }

    public void update(Brand brand) {
        brand.setUpdateTime(new Date());
        brandDao.updateByPrimaryKeySelective(brand);
    }

    public void deleteById(long id) {
        brandDao.deleteByPrimaryKey(id);
    }

    public List<Brand> searchList(Brand brand) {
        return brandDao.selectByExample(genExampleByBrand(brand));
    }

    public PageInfo<Brand> listWithPage(int page, int size) {
        PageHelper.startPage(page, size);
        return new PageInfo<Brand>(brandDao.selectAll());
    }

    public PageInfo<Brand> searchWithPage(Brand brand, int page, int size) {
        PageHelper.startPage(page, size);
        return new PageInfo<Brand>(brandDao.selectByExample(genExampleByBrand(brand)));
    }

    public List<Brand> listByCategoryId(long categoryId) {
        Example example = new Example(CategoryBrand.class);
        Example.Criteria criteria = example.createCriteria();
        criteria.andEqualTo("categoryId", categoryId);
        List<CategoryBrand> categoryBrands = categoryBrandDao.selectByExample(example);
        List<Brand> res = new ArrayList<>(categoryBrands.size());
        for (CategoryBrand categoryBrand: categoryBrands) {
            res.add(brandDao.selectByPrimaryKey(categoryBrand.getBrandId()));
        }
        return res;
    }

    private Example genExampleByBrand(Brand brand) {
        Example example = new Example(Brand.class);
        Example.Criteria criteria = example.createCriteria();
        if (brand != null) {
            if (brand.getId() != null) {
                criteria.andEqualTo("id", brand.getId());
            }
            if (!StringUtils.isEmpty(brand.getName())) {
                criteria.andLike("name", "%" + brand.getName() + "%");
            }
            if (!StringUtils.isEmpty(brand.getBeginLetter())) {
                criteria.andEqualTo("beginLetter", brand.getBeginLetter());
            }
        }
        return example;
    }

    public static void main(String[] args) throws Exception {
        File file = new File("/Users/**/IdeaProjects/zhuawa-shop/sql/goods_tmp_data.sql");
        File file2 = new File("/Users/**/IdeaProjects/zhuawa-shop/sql/goods_data.sql");
        FileWriter fileWriter = new FileWriter(file2, true);
        BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(new FileInputStream(file)));
        Map<Long, Long> brandOldId2NewId = new HashMap<>();
        Map<Long, Long> categoryOldId2NewId = new HashMap<>();
        List<String> categoryNameList = new ArrayList<>();
        List<Long> categoryParentIdList = new ArrayList<>();
        long brandNewId = 1;
        long categoryNewId = 1;
        String line = null;
        int tag = 0;
        Set<String> brandNameSet = new HashSet<>();
        Set<String> categoryNameSet =new HashSet<>();
        Set<Long> noNeedCategoryId = new HashSet<>();
        Set<Long> noNeedBrandId = new HashSet<>();
        while ((line = bufferedReader.readLine()) != null) {
            if (line.contains("-- category --")) {
                tag = 1;
                continue;
            }
            if (line.contains("-- category_brand --")) {
                tag = 2;
                continue;
            }
            String dataStr = line.substring(line.indexOf('(') + 1, line.lastIndexOf(')'));
            System.out.println(dataStr);
            String[] dataStrs = dataStr.split(", ");
            if (tag == 0) {
                String brandName = dataStrs[1];
                long brandOldId = Long.parseLong(dataStrs[0]);
                if (brandNameSet.contains(brandName.toLowerCase())) {
                    noNeedBrandId.add(brandOldId);
                    continue;
                }
                brandNameSet.add(brandName.toLowerCase());
                brandOldId2NewId.put(brandOldId, brandNewId);
                String brandBeginLetter = dataStrs[3];
                String sql = "insert into brand (id, name, begin_letter) values (" + brandNewId + ", " + brandName + ", " + brandBeginLetter + ");";
                fileWriter.write(sql + "\n");
                brandNewId++;
            } else if (tag == 1) {
                String categoryName = dataStrs[1];
                long categoryOldId = Long.parseLong(dataStrs[0]);
                if (categoryNameSet.contains(categoryName.toLowerCase())) {
                    noNeedCategoryId.add(categoryOldId);
                    continue;
                }
                categoryNameSet.add(categoryName.toLowerCase());
                categoryOldId2NewId.put(categoryOldId, categoryNewId);
                long parentId = Long.parseLong(dataStrs[6]);
                categoryNameList.add(categoryName);
                categoryParentIdList.add(parentId);
                categoryNewId++;
            } else if (tag == 2) {
                long categoryOldId = Long.parseLong(dataStrs[0]);
                long brandOldId = Long.parseLong(dataStrs[1]);
                if (noNeedBrandId.contains(brandOldId) || noNeedCategoryId.contains(categoryOldId)) {
                    continue;
                }
                String sql = "insert into category_brand (category_id, brand_id) values(" + categoryOldId2NewId.get(categoryOldId) + ", " + brandOldId2NewId.get(brandOldId) + ");";
                fileWriter.write(sql + "\n");
            }
        }
        for (int i = 0; i < categoryNameList.size(); i++) {
            long parentId = categoryOldId2NewId.getOrDefault(categoryParentIdList.get(i), 0L);
            String sql = "insert into category(name, parent_id, template_id) values("+categoryNameList.get(i) + ", " + parentId + ", " + 1 +");";
            fileWriter.write(sql+"\n");
        }
        fileWriter.flush();
        fileWriter.close();
    }
}
