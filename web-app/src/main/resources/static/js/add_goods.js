$(function(){
    getAllCategory(0, '#category1');

    $('#category1').change(
        function() {
           console.log("category1 change to " + $(this).find('option:selected').val());
           $('#category2').empty();
           $('#category3').empty();
           getAllCategory($(this).find('option:selected').val(), '#category2');
        }
    );

    $('#category2').change(
        function() {
            console.log("category2 change to " + $(this).find('option:selected').val());
            $('#category3').empty();
            getAllCategory($(this).find('option:selected').val(), '#category3');
        }
    );

    $('#category3').change(
            function() {
                console.log("category3 change to " + $(this).find('option:selected').val());

            }
        );
})

function getAllCategory(parentId, selectorId) {
    console.log("getAllCategory " + parentId);
    $.ajax({
        url:"/category/getCategoriesByParentId?parentId=" + parentId,
        type:"GET",
        success:function(data){
            if(data.code == 0){
                render(data.data, selectorId);
            }else{
                layer.msg(data.msg);
            }
        },
        error:function(){
            layer.msg("客户端请求有误");
        }
    });
};

function render(data, selectId) {
    for(var i = 0; i< data.length; i++) {
        $(selectId).append('<option value="'+data[i].id+'">'+data[i].name+'</option>');
    }
}



