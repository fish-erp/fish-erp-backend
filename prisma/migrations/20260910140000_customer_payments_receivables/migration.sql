-- Migration: Chuyển công nợ sang Khách hàng, hỗ trợ trả trước khi mua và trả 1 cục tùy lúc

-- 1. Đổi tên bảng invoice_payment thành customer_payment
ALTER TABLE fish_erp.invoice_payment RENAME TO customer_payment;

-- 2. Thêm cột customer_id vào customer_payment
ALTER TABLE fish_erp.customer_payment ADD COLUMN customer_id UUID;

-- 3. Điền customer_id từ export_invoice cho 8 khoản thanh toán cũ trong DB
UPDATE fish_erp.customer_payment p
SET customer_id = i.customer_id
FROM fish_erp.export_invoice i
WHERE p.invoice_id = i.id;

-- 4. Đặt customer_id NOT NULL (mọi khoản thu đều phải có khách hàng)
ALTER TABLE fish_erp.customer_payment ALTER COLUMN customer_id SET NOT NULL;

-- 5. Cho phép invoice_id được NULL (để khách có thể trả 1 cục tùy lúc không gắn với hóa đơn)
ALTER TABLE fish_erp.customer_payment ALTER COLUMN invoice_id DROP NOT NULL;

-- 6. Cập nhật các khóa ngoại (Foreign Keys)
ALTER TABLE fish_erp.customer_payment DROP CONSTRAINT invoice_payment_invoice_id_fkey;

ALTER TABLE fish_erp.customer_payment
  ADD CONSTRAINT customer_payment_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES fish_erp.customer(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE fish_erp.customer_payment
  ADD CONSTRAINT customer_payment_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES fish_erp.export_invoice(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Cập nhật các chỉ mục (Indexes)
DROP INDEX IF EXISTS fish_erp.invoice_payment_invoice_id_idempotency_key_key;
DROP INDEX IF EXISTS fish_erp.invoice_payment_invoice_id_paid_at_idx;

CREATE UNIQUE INDEX customer_payment_customer_id_idempotency_key_key ON fish_erp.customer_payment(customer_id, idempotency_key);
CREATE INDEX customer_payment_customer_id_paid_at_idx ON fish_erp.customer_payment(customer_id, paid_at);
CREATE INDEX customer_payment_invoice_id_idx ON fish_erp.customer_payment(invoice_id);

-- 8. Đổi tên các ràng buộc (Constraints) còn lại
ALTER TABLE fish_erp.customer_payment RENAME CONSTRAINT invoice_payment_pkey TO customer_payment_pkey;
ALTER TABLE fish_erp.customer_payment RENAME CONSTRAINT invoice_payment_amount_positive TO customer_payment_amount_positive;
ALTER TABLE fish_erp.customer_payment RENAME CONSTRAINT invoice_payment_reversal_complete TO customer_payment_reversal_complete;

-- 9. Dọn dẹp các cột thừa không cần thiết trên export_invoice
ALTER TABLE fish_erp.export_invoice
  DROP COLUMN IF EXISTS payment_tracked,
  DROP COLUMN IF EXISTS reconciliation_note,
  DROP COLUMN IF EXISTS reconciled_at,
  DROP COLUMN IF EXISTS reconciled_by;
