create table if not exists `order`.cart_item
(
	id bigint unsigned auto_increment
		primary key,
	goods_id bigint unsigned default '0' not null,
	user_id bigint unsigned default '0' not null,
	create_time datetime default CURRENT_TIMESTAMP not null,
	update_time datetime default CURRENT_TIMESTAMP not null,
	price bigint unsigned default '0' not null comment 'price when add to cart',
	count int unsigned default '1' not null,
	constraint cart_item_user_id_goods_id_uindex
		unique (user_id, goods_id)
);

create table if not exists `order`.orders
(
	id bigint unsigned auto_increment
		primary key,
	user_id bigint unsigned default '0' not null,
	receive_address varchar(127) default '' not null,
	pay_type tinyint unsigned default '0' not null comment '0: online
1: offline',
	consumer_msg varchar(255) default '' not null,
	total_price bigint unsigned default '0' not null,
	discount_price bigint unsigned default '0' not null,
	actual_price bigint unsigned default '0' not null,
	status smallint unsigned default '0' not null comment '0: not pay
1: payed
2: sended
3: received
4: over
5: commented',
	create_time datetime default CURRENT_TIMESTAMP not null,
	update_time datetime default CURRENT_TIMESTAMP not null
);

create table `order`.order_item
(
	id bigint unsigned auto_increment
		primary key,
	create_time datetime default CURRENT_TIMESTAMP not null,
	update_time datetime default CURRENT_TIMESTAMP not null,
	cart_item_id bigint unsigned default '0' not null,
	goods_id bigint unsigned default '0' not null,
	user_id bigint unsigned default '0' not null,
	order_id bigint unsigned default '0' not null,
	price bigint unsigned default '0' not null,
	discount_price bigint unsigned default '0' not null,
	actual_price bigint unsigned default '0' not null,
	count int unsigned default '0' not null,
	goods_name varchar(255) default '' not null,
	goods_image varchar(511) default '' not null
);

