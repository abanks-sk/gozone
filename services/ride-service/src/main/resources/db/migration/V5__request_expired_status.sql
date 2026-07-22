-- Allow the EXPIRED status for immediate requests that time out with no driver.
ALTER TABLE ride_requests DROP CONSTRAINT IF EXISTS ride_requests_status_check;
ALTER TABLE ride_requests ADD CONSTRAINT ride_requests_status_check
    CHECK (status IN ('OPEN','MATCHED','CANCELLED','EXPIRED'));
