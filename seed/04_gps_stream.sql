-- Scripted GPS stream for demo — simulates driver moving from Airport to Osu
-- Load into ride_db. Positions are Accra, Ghana coordinates.
-- In the live demo, the seeder script calls POST /rides/locations in sequence.

-- Seed initial driver location (driver 2 at Kotoka International Airport area)
\c ride_db;

INSERT INTO driver_locations (driver_id, point, updated_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000002',
  ST_SetSRID(ST_MakePoint(-0.1674, 5.6052), 4326)::geography,
  NOW()
)
ON CONFLICT (driver_id) DO UPDATE
  SET point = EXCLUDED.point,
      updated_at = EXCLUDED.updated_at;

-- Scripted waypoints (lon, lat) for demo GPS playback via seed/run_gps_demo.sh
-- Airport → Ring Road → Osu
-- Loaded by seed/run_gps_demo.sh which calls the REST API, not direct DB inserts.
