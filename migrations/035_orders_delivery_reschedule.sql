-- Auto-reschedule overdue unfinished vendor orders to next work-shift day.
-- Live field remains delivery_date; previous_delivery_date keeps the bumped-from date.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_rescheduled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_delivery_date DATE;

COMMENT ON COLUMN orders.is_rescheduled IS 'True when delivery_date was auto-bumped past an unfinished deadline';
COMMENT ON COLUMN orders.rescheduled_at IS 'When delivery_date was last auto-rescheduled';
COMMENT ON COLUMN orders.previous_delivery_date IS 'delivery_date value before the latest auto-reschedule';
