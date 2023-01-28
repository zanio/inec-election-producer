DROP TABLE IF EXISTS data_digestion.tile_vehicle_count;

CREATE TABLE data_digestion.tile_vehicle_count(
            quad_key text PRIMARY KEY,
            vehicle_count int);