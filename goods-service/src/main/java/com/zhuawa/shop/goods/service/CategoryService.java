package com.zhuawa.shop.goods.service;

import com.zhuawa.shop.goods.dao.CategoryDao;
import com.zhuawa.shop.goods.model.Category;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tk.mybatis.mapper.entity.Example;

import java.util.List;

@Service
public class CategoryService {

    @Autowired
    CategoryDao categoryDao;

    public List<Category> getCategoriesByParentId(Long parentId) {
        Example example = new Example(Category.class);
        Example.Criteria criteria = example.createCriteria();
        criteria.andEqualTo("parentId", parentId);
        return categoryDao.selectByExample(example);
    }
}
