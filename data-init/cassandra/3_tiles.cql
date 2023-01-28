DROP TABLE IF EXISTS data_digestion.tiles;
CREATE TABLE data_digestion.tiles (
                    vehicle_id int,
                    quad_key text,
                    insertion_time timestamp,
                    PRIMARY KEY (vehicle_id, insertion_time))
WITH CLUSTERING ORDER BY (insertion_time DESC);