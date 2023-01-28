DROP TABLE IF EXISTS data_digestion.tile_vehicles;
-- the vehicle field would be an array of string
CREATE TABLE data_digestion.tile_vehicles (
                    quad_key text,
                    vehicle_ids SET<int>,
                    insertion_time timestamp,
                    PRIMARY KEY (quad_key, insertion_time))
WITH CLUSTERING ORDER BY (insertion_time DESC);