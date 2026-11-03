## es + kibana 安装步骤

docker pull nshou/elasticsearch-kibana # 直接安装 es 和 kibana 组合，因为我们需要用kibana来管理我们在es中的数据  
docker run -it --name es-kibana -d -p 9200:9200 -p 5601:5601 nshou/elasticsearch-kibana # 启动  
./elasticsearch-plugin install https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v7.12.1/elasticsearch-analysis-ik-7.12.1.zip # 安装 ik 分词器  

## DSL 语句简单示例

```dsl
GET _analyze
{
  "analyzer": "ik_smart",
  "text": "写作狂人来自北京通州"
}
GET _analyze
{
  "analyzer": "ik_smart",
  "text": "中国共产党"
}
GET _analyze
{
  "analyzer": "ik_max_word",
  "text": "中国共产党"
}

# 查询所有索引
GET /_cat/indices?v

# 新增索引
PUT /user

# 删除索引
DELETE /user

# 添加映射
PUT /user/_mapping
{
    "properties": {
      "name": {
			  "type": "text",
			  "analyzer": "ik_smart",
			  "store": false,
			  "search_analyzer": "ik_smart"
		  },
      "city": {
			  "type": "text",
			  "analyzer": "ik_smart",
			  "store": false,
			  "search_analyzer": "ik_smart"
		  },
		  "age": {
			  "type": "long",
			  "store": false
		  },
		  "description": {
			  "type": "text",
			  "analyzer": "ik_smart",
			  "store": false,
			  "search_analyzer": "ik_smart"
		  }
    }
}

# 查看映射
GET /user/_mapping

# 添加数据
POST /user/_doc/1
{
	"name":"张一丰",
	"age":32,
	"city":"武汉",
	"description":"加班狂人来自湖北武汉"
}

POST /user/_doc/2
{
	"name":"张二丰",
	"age":10,
	"city":"广州",
	"description":"学习狂人"
}

POST /user/_doc/3
{
	"name":"张三丰",
	"age":20,
	"city":"台州",
	"description":"划水狂人"
}

POST /user/_doc/4
{
	"name":"张四丰",
	"age":39,
	"city":"惠州",
	"description":"摸鱼狂人来自通州"
}

POST /user/_doc/5
{
	"name":"张五丰",
	"age":48,
	"city":"通州",
	"description":"写作狂人"
}


GET /user/_doc/4

DELETE /user/_doc/1

# 查询所有
GET /user/_search

# 排序
GET /user/_search
{
  "query": {
    "match_all": {}
  },
  "sort": [
    {
      "age": {
        "order": "desc"
      }
    }
  ]
}

# 分页查询
GET /user/_search
{
  "query": {
    "match_all": {}
  },
  "sort": [
    {
      "age": {
        "order": "desc"
      }
    }
  ],
  "from": 2,
  "size": 2
}

# 搜索
GET /user/_search
{
  "query": {
    "term": {
      "city": {
        "value": "通州"
      }
    }
  },
  "sort": [
    {
      "age": {
        "order": "desc"
      }
    }
  ]
}

# 多值匹配
GET /user/_search
{
  "query": {
    "terms": {
      "city": [
        "通州", "杭州"
        ]
    }
  },
  "sort": [
    {
      "age": {
        "order": "desc"
      }
    }
  ]
}

# 范围过滤
GET /user/_search
{
  "query": {
    "range": {
      "age": {
        "gte": 20,
        "lte": 50
      }
    }
  },
  "sort": [
    {
      "age": {
        "order": "desc"
      }
    }
  ]
}

POST /user/_doc/6
{
	"name":"张六丰",
	"age":60,
	"city":"儋州",
	"description":"跑酷达人",
	"gender": "女"
}

# 查询存在某个域的数据
GET /user/_search
{
  "query": {
    "exists": {
      "field": "gender"
    }
  }
}

# 多条件查询 city: 杭州 and age [20,30]
GET /user/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "city": {
              "value": "通州"
            }
          }
        },
        {
          "range": {
            "age": {
              "gte": 20,
              "lte": 30
            }
          }
        }
      ]
    }
  }
}

# 模糊搜索
GET /user/_search
{
  "query": {
    "match": {
      "description": "武汉"
    }
  }
}

# 前缀搜索
GET /user/_search
{
  "query": {
    "prefix": {
      "name": {
        "value": "张"
      }
    }
  }
}

# 多个域匹配搜索 description 或者 city 里都包含 通州
GET /user/_search
{
  "query": {
    "multi_match": {
      "query": "通州",
      "fields": [
        "city", "description"
        ]
    }
  }
}

```