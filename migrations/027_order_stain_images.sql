-- ============================================================
-- MIGRATION 027: Multiple stain images on orders
-- Alters: orders (stain_image VARCHAR → stain_images JSONB array)
-- Run after: 023_order_stain_columns.sql
-- ============================================================

ALTER TABLE public.orders
    ALTER COLUMN stain_image TYPE JSONB
    USING CASE
        WHEN stain_image IS NULL THEN NULL
        ELSE jsonb_build_array(stain_image)
    END;

ALTER TABLE public.orders
    RENAME COLUMN stain_image TO stain_images;
