-- GoZone: create the four logical databases and enable PostGIS on ride_db
-- This script runs once when the Postgres container is first initialised.

CREATE DATABASE auth_db;
CREATE DATABASE ride_db;
CREATE DATABASE food_db;
CREATE DATABASE wallet_db;

\connect ride_db
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
