-- Add tsvector column for full-text search
ALTER TABLE "products" ADD COLUMN "search_vector" tsvector;

-- Create GIN index for fast full-text search lookups
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");

-- Create trigger function: weight A for name (highest relevance), weight B for description
CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires only when name or description changes
CREATE TRIGGER products_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description
  ON "products"
  FOR EACH ROW
  EXECUTE FUNCTION products_search_vector_update();

-- Backfill existing rows
UPDATE "products" SET search_vector =
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B');
