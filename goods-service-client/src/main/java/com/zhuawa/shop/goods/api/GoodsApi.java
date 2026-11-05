package com.zhuawa.shop.goods.api;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Goods;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

@FeignClient(value = "goods")
@RequestMapping("/goods")
public interface GoodsApi {
    @GetMapping("/getAllValidGoods")
    Result<List<Goods>> getAllValidGoods();

    @GetMapping("/get/{id}")
    Result<Goods> get(@PathVariable(name = "id") Long id);

    @GetMapping("/decrStock")
    Result<String> decrStock(@RequestParam Long goodsId, @RequestParam Integer count);

    /**
     * 批量获得商品详情。
     *
     * <p>返回 Map 只含真实存在的商品；JSON 里 object 的 key 是字符串形式
     * （雪花 id → {@code "1234567890123"}），Feign 用 Jackson 解码到
     * {@code Map<Long, Goods>} 时会把 String key 转换回 Long，调用方拿到的就是 Long key。</p>
     */
    @PostMapping("/getByIds")
    Result<Map<Long, Goods>> getByIds(@RequestBody List<Long> ids);
}
