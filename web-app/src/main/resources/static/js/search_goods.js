$(function(){

});
var category;
var brand;
var specsValueMap;
var page = 1;
var orderField = '';
var orderType = '';
var minPrice;
var maxPrice;
var baseUrl = "http://127.0.0.1:18003/search";
function search() {
    var postParams = {
        "key": $('#key').val(),
        "orderField": orderField,
        "orderType": orderType
    }
    if (brand != null) {
        postParams['brand'] = brand;
    }
    if (category != null) {
        postParams['category'] = category;
    }
    if (specsValueMap != null) {
        postParams['specsValueMap'] = specsValueMap;
    }
    if (minPrice != null) {
        postParams['minPrice'] = minPrice * 100;
    }
    if (maxPrice != null) {
        postParams['maxPrice'] = maxPrice * 100;
    }
    console.log(postParams)
    $.ajax({
            url: baseUrl + "/goods/search/"+page+"/10",
            type:"POST",
            contentType: "application/json",
            dataType:"json",
            data: JSON.stringify(postParams),
            success:function(data){
                if(data.code == 0){
                    console.log(data.data);
                    render(data.data);
                }else{
                    layer.msg(data.msg);
                }
            },
            error:function(){
                layer.msg("客户端请求有误");
            }
        });
}

function searchByPage(p) {
    console.log(p);
    page = p;
    search();
}
function searchByBrand(b) {
    console.log(b);
    brand = b;
    search();
}
function searchByCategory(c) {
    console.log(c);
    category = c;
    search();
}
function searchBySpecsValueMap(k, v) {
    console.log(k + ":" + v);
    if (specsValueMap == null) {
        specsValueMap = {};
    }
    specsValueMap[k] = v;
    search();
}
function searchByOrder() {
    orderField = 'price';
    if (orderType == 'asc') {
        orderType = 'desc';
    } else {
        orderType = 'asc';
    }
    console.log(orderType)
    search();
}
function searchByPrice() {
    minPrice = $('#minPrice').val();
    maxPrice = $('#maxPrice').val();
    console.log(minPrice + "," + maxPrice);
    search();
}

function render(data) {
    $('#filters').children('span').remove();
    if (data.category != null) {
        $('#filters').append('<span class="label label-default" style="margin-left: 5px; margin-right: 5px">'+data.category+'</span>');
    }
    if (data.brand != null) {
        $('#filters').append('<span class="label label-default" style="margin-left: 5px; margin-right: 5px">'+data.brand+'</span>');
    }
    if (data.specsValueMap != null) {
        for(var key in data.specsValueMap) {
            $('#filters').append('<span class="label label-default" style="margin-left: 5px; margin-right: 5px">'+ key +":" + data.specsValueMap[key]+'</span>');
        }
    }
    if (data.categoryList != null && data.category == null) {
        $("#categoryList").css("display", "block");
        $("#categoryList").children('a').remove();
        for(var i in data.categoryList) {
            $("#categoryList").append('<a style="margin-left: 5px; margin-right: 5px" onclick=searchByCategory("' + data.categoryList[i] + '")>' + data.categoryList[i] + '</a>');
        }
    } else {
        $("#categoryList").css("display", "none");
    }
    $("#brandList").children('a').remove();
    if (data.brandList != null && data.brand == null) {
        $("#brandList").css("display", "block");
        for(var i in data.brandList) {
            $("#brandList").append('<a style="margin-left: 5px; margin-right: 5px" onclick=searchByBrand("'+data.brandList[i]+'")>' + data.brandList[i] + '</a>');
        }
    } else {
        $("#brandList").css("display", "none");
    }
    $('#specsList').children('div').remove();
    if (data.specsList != null) {
        for(var specsName in data.specsList) {
            var specsDiv = "<div><h4>" + specsName + "</h4>";
            for(var option in data.specsList[specsName]) {
                specsDiv = specsDiv + '<a style="margin-left: 5px; margin-right: 5px" onclick=searchBySpecsValueMap("' + specsName + '","' +data.specsList[specsName][option]+  '")>' + data.specsList[specsName][option] + '</a>';
            }
            specsDiv = specsDiv + '</div>';
            $('#specsList').append(specsDiv);
        }
    }
    $('#goodsList').children('tbody').children('tr').remove();
    $('#goodsList').append('<tr><td>商品名称</td><td>商品分类</td><td>商品品牌</td><td>商品图片</td><td>商品价格</td><td>库存数量</td></tr>');
    if (data.goodsEsInfoList != null) {
        for(var i in data.goodsEsInfoList) {
            var trDiv = "<tr>";
            trDiv += "<td>" + data.goodsEsInfoList[i].name + "</td>";
            trDiv += "<td>" + data.goodsEsInfoList[i].categoryName + "</td>";
            trDiv += "<td>" + data.goodsEsInfoList[i].brandName + "</td>";
            trDiv += '<td><img src="'+data.goodsEsInfoList[i].image+'" width="100" height="100" /></td>';
            trDiv += "<td>" + data.goodsEsInfoList[i].price/100 + "</td>";
            trDiv += "<td>" + data.goodsEsInfoList[i].stock + "</td>";
            trDiv = trDiv + "</tr>";
            $('#goodsList').append(trDiv);
        }
    }
    $('#pages').children('li').remove();
    for(var i = 1; i <= data.totalPages; i++) {
        var pageLi = '<li><a href="#" onclick="searchByPage('+i+')">'+i+'</a></li>';
        $('#pages').append(pageLi);
    }
}