-- DropIndex (replace separate status and createdAt indexes with compound)
DROP INDEX "payments_created_at_idx";
DROP INDEX "payments_status_idx";

-- CreateIndex (compound index for abandoned payment cleanup: WHERE status = 'PENDING' AND created_at < cutoff)
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex (expression index for low-stock product queries)
CREATE INDEX "idx_products_available_stock" ON "products" ((stock - reserved_stock)) WHERE is_active = true;
