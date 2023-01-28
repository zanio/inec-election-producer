 DROP TABLE IF EXISTS data_digestion.vehicle_location;

 CREATE TABLE data_digestion.vehicle_location(
        vehicle_id int,
        latitude double,
        longitude double,
        insertion_time timestamp,
        PRIMARY KEY (vehicle_id, insertion_time))
 WITH CLUSTERING ORDER BY (insertion_time DESC);