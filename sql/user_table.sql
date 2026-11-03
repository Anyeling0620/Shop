create table user.user
(
	id bigint unsigned auto_increment
		primary key,
	mobile varchar(45) not null,
	nickname varchar(45) not null,
	password varchar(45) not null,
	salt varchar(45) null,
	avatar varchar(45) null,
	create_time datetime default CURRENT_TIMESTAMP not null,
	update_time datetime default CURRENT_TIMESTAMP not null,
	last_login_time datetime default CURRENT_TIMESTAMP not null,
	login_count int unsigned default 0 not null,
	point int unsigned default 0 not null
)
charset=utf8;

