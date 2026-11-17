# ES 高亮标签被转义后以字面量画在页面上

## 错误信息

页面上直接显示：

```
<font color='red'>手机</font>
```

而不是红色高亮的「手机」二字。每张商品卡片都出现一次，首页 24 张卡片共 24 处。

## 原因

搜索服务返回的 `name` / `brandName` / `categoryName` 字段里带有 Elasticsearch 的高亮标记 `<font color='red'>…</font>`。

前端 `web/src/assets/shop-ui.js` 的 `card()` 为了防 XSS 对字段做了 `escapeHtml()`，把 `<` `>` 转成了 `&lt;` `&gt;`，浏览器于是把它当普通文本渲染出来。

## 修复

新增 `highlight()`：先整体转义，再把**唯一允许的**高亮标签还原成 `<mark class="hl">`，其它标签一律保持转义。

```js
function highlight(input) {
  var raw = String(input == null ? '' : input);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;font color='red'&gt;/g, '<mark class="hl">')
    .replace(/&lt;\/font&gt;/g, '</mark>');
}
```

`card()` 里商品名、品牌、类目都改用 `highlight()` 渲染。样式在 `site.css` 中补 `mark.hl`。

回归断言：`web/e2e-check.mjs` 检查页面正文不含 `<font color` 字面量，并统计 `mark.hl` 数量。
