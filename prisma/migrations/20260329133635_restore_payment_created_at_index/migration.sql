-- CreateIndex (restore standalone createdAt index for admin payment listing)
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");
