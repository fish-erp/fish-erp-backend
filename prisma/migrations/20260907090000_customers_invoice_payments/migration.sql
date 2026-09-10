-- Existing invoices deliberately remain unverified; never infer historic payments.
CREATE TABLE fish_erp.customer (
 id UUID PRIMARY KEY, name VARCHAR(120) NOT NULL, phone_number VARCHAR(20) NOT NULL,
 address VARCHAR(500), archived BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL, created_by UUID, updated_by UUID
);
CREATE UNIQUE INDEX customer_phone_number_key ON fish_erp.customer(phone_number);
CREATE INDEX customer_name_idx ON fish_erp.customer(name);
ALTER TABLE fish_erp.export_invoice ADD COLUMN customer_id UUID,
 ADD COLUMN payment_tracked BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN planned_paid_amount DECIMAL(18,2),
 ADD COLUMN reconciliation_note VARCHAR(500),
 ADD COLUMN reconciled_at TIMESTAMPTZ(3),
 ADD COLUMN reconciled_by UUID,
 ADD CONSTRAINT export_invoice_customer_id_fkey FOREIGN KEY(customer_id) REFERENCES fish_erp.customer(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT export_invoice_planned_paid_nonnegative CHECK(planned_paid_amount >= 0);
CREATE INDEX "export_invoice_customer_id_exportStatus_idx" ON fish_erp.export_invoice(customer_id,"exportStatus");
CREATE TABLE fish_erp.invoice_payment (
 id UUID PRIMARY KEY, invoice_id UUID NOT NULL, amount DECIMAL(18,2) NOT NULL,
 idempotency_key VARCHAR(100) NOT NULL, note VARCHAR(500),
 paid_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by UUID NOT NULL,
 reversed_at TIMESTAMPTZ(3), reversed_by UUID, reversal_reason VARCHAR(500),
 CONSTRAINT invoice_payment_invoice_id_fkey FOREIGN KEY(invoice_id) REFERENCES fish_erp.export_invoice(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT invoice_payment_amount_positive CHECK(amount > 0),
 CONSTRAINT invoice_payment_reversal_complete CHECK((reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL) OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND length(trim(reversal_reason)) > 0))
);
CREATE UNIQUE INDEX invoice_payment_invoice_id_idempotency_key_key ON fish_erp.invoice_payment(invoice_id,idempotency_key);
CREATE INDEX invoice_payment_invoice_id_paid_at_idx ON fish_erp.invoice_payment(invoice_id,paid_at);
