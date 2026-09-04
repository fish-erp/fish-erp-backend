-- Migration giữ lại Product và dữ liệu phiếu nhập hiện có.
-- Dừng sớm nếu các dòng cùng mã phiếu đang có trạng thái không nhất quán.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fish_erp.import_product
    GROUP BY import_code
    HAVING COUNT(DISTINCT status) > 1
  ) THEN
    RAISE EXCEPTION 'Không thể migrate: có import_code chứa nhiều trạng thái khác nhau';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM fish_erp.import_product
    GROUP BY import_code, product_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Không thể migrate: một sản phẩm bị lặp trong cùng import_code';
  END IF;
END $$;

CREATE TABLE fish_erp.import_receipt (
  id UUID NOT NULL,
  import_code VARCHAR(50) NOT NULL,
  status fish_erp.import_status NOT NULL DEFAULT 'DRAFT',
  import_note VARCHAR(1000),
  completed_at TIMESTAMPTZ(3),
  cancelled_at TIMESTAMPTZ(3),
  delete_at TIMESTAMPTZ(3),
  delete_by UUID,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  updated_by UUID,
  CONSTRAINT import_receipt_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX import_receipt_import_code_key ON fish_erp.import_receipt(import_code);
CREATE INDEX import_receipt_status_completed_at_idx ON fish_erp.import_receipt(status, completed_at);
CREATE INDEX import_receipt_created_at_idx ON fish_erp.import_receipt(created_at);

INSERT INTO fish_erp.import_receipt (
  id, import_code, status, import_note, completed_at, cancelled_at,
  delete_at, delete_by, created_at, created_by, updated_at, updated_by
)
SELECT
  gen_random_uuid(), import_code, MIN(status::text)::fish_erp.import_status,
  MIN(import_note), MIN(completed_at), MIN(cancelled_at), MIN(delete_at),
  (array_agg(delete_by ORDER BY created_at) FILTER (WHERE delete_by IS NOT NULL))[1],
  MIN(created_at),
  (array_agg(created_by ORDER BY created_at) FILTER (WHERE created_by IS NOT NULL))[1],
  MAX(updated_at),
  (array_agg(updated_by ORDER BY updated_at DESC) FILTER (WHERE updated_by IS NOT NULL))[1]
FROM fish_erp.import_product
GROUP BY import_code;

ALTER TABLE fish_erp.import_product
  ADD COLUMN import_receipt_id UUID,
  ADD COLUMN line_note VARCHAR(500),
  ADD COLUMN product_code_snapshot VARCHAR(50),
  ADD COLUMN product_name_snapshot VARCHAR(255),
  ADD COLUMN product_unit_snapshot VARCHAR(20);

UPDATE fish_erp.import_product AS item
SET import_receipt_id = receipt.id,
    line_note = item.import_note,
    product_code_snapshot = CASE WHEN item.status = 'COMPLETED' THEN product.product_code END,
    product_name_snapshot = CASE WHEN item.status = 'COMPLETED' THEN product.product_name END,
    product_unit_snapshot = CASE WHEN item.status = 'COMPLETED' THEN product.product_unit END
FROM fish_erp.import_receipt AS receipt, fish_erp.product AS product
WHERE receipt.import_code = item.import_code AND product.id = item.product_id;

ALTER TABLE fish_erp.import_product ALTER COLUMN import_receipt_id SET NOT NULL;
-- DB cũ có thể đã đổi unique index sang index thường để hỗ trợ nhiều dòng cùng mã phiếu.
-- Xóa cả hai tên theo cách idempotent để migration giữ dữ liệu chạy được trên cả hai trạng thái.
DROP INDEX IF EXISTS fish_erp.import_product_import_code_key;
DROP INDEX IF EXISTS fish_erp.import_product_import_code_idx;
ALTER TABLE fish_erp.import_product
  DROP COLUMN import_code,
  DROP COLUMN import_note,
  DROP COLUMN status,
  DROP COLUMN completed_at,
  DROP COLUMN cancelled_at,
  DROP COLUMN delete_at,
  DROP COLUMN delete_by;
ALTER TABLE fish_erp.import_product
  ADD CONSTRAINT import_product_import_receipt_id_fkey
  FOREIGN KEY (import_receipt_id) REFERENCES fish_erp.import_receipt(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX import_product_import_receipt_id_product_id_key
  ON fish_erp.import_product(import_receipt_id, product_id);
DROP INDEX IF EXISTS fish_erp.import_product_product_id_status_expire_date_idx;
DROP INDEX IF EXISTS fish_erp.import_product_status_completed_at_idx;
DROP INDEX IF EXISTS fish_erp.import_product_created_at_idx;
CREATE INDEX import_product_product_id_expire_date_idx ON fish_erp.import_product(product_id, expire_date);

ALTER TABLE fish_erp.export_product
  ADD COLUMN product_code_snapshot VARCHAR(50),
  ADD COLUMN product_name_snapshot VARCHAR(255),
  ADD COLUMN product_unit_snapshot VARCHAR(20);

UPDATE fish_erp.export_product AS item
SET product_code_snapshot = product.product_code,
    product_name_snapshot = product.product_name,
    product_unit_snapshot = product.product_unit
FROM fish_erp.product AS product, fish_erp.export_invoice AS invoice
WHERE item.product_id = product.id
  AND item.export_invoice_id = invoice.id
  AND invoice."exportStatus" = 'COMPLETED';

CREATE TYPE fish_erp.inventory_movement_type AS ENUM (
  'OPENING_BALANCE', 'IMPORT_COMPLETED', 'IMPORT_CANCELLED',
  'EXPORT_COMPLETED', 'EXPORT_CANCELLED'
);
CREATE TYPE fish_erp.inventory_document_type AS ENUM ('OPENING', 'IMPORT', 'EXPORT');

CREATE TABLE fish_erp.inventory_movement (
  id UUID NOT NULL,
  movement_type fish_erp.inventory_movement_type NOT NULL,
  document_type fish_erp.inventory_document_type NOT NULL,
  document_id UUID NOT NULL,
  document_code VARCHAR(50) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_price DECIMAL(18,2),
  occurred_at TIMESTAMPTZ(3) NOT NULL,
  product_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  CONSTRAINT inventory_movement_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movement_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES fish_erp.product(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX inventory_movement_movement_type_document_id_product_id_key
  ON fish_erp.inventory_movement(movement_type, document_id, product_id);
CREATE INDEX inventory_movement_product_id_occurred_at_idx
  ON fish_erp.inventory_movement(product_id, occurred_at);
CREATE INDEX inventory_movement_movement_type_occurred_at_idx
  ON fish_erp.inventory_movement(movement_type, occurred_at);
CREATE INDEX inventory_movement_occurred_at_idx ON fish_erp.inventory_movement(occurred_at);

-- Backfill ledger nhập kho. Phiếu đã hủy sau khi hoàn thành có cả movement cộng và hoàn tác.
INSERT INTO fish_erp.inventory_movement (
  id, movement_type, document_type, document_id, document_code,
  quantity_delta, unit_price, occurred_at, product_id, created_by
)
SELECT gen_random_uuid(), 'IMPORT_COMPLETED', 'IMPORT', receipt.id, receipt.import_code,
       item.import_quantity, item.import_price, COALESCE(receipt.completed_at, receipt.created_at),
       item.product_id, receipt.created_by
FROM fish_erp.import_receipt AS receipt
JOIN fish_erp.import_product AS item ON item.import_receipt_id = receipt.id
WHERE receipt.completed_at IS NOT NULL;

INSERT INTO fish_erp.inventory_movement (
  id, movement_type, document_type, document_id, document_code,
  quantity_delta, unit_price, occurred_at, product_id, created_by
)
SELECT gen_random_uuid(), 'IMPORT_CANCELLED', 'IMPORT', receipt.id, receipt.import_code,
       -item.import_quantity, item.import_price, COALESCE(receipt.cancelled_at, receipt.delete_at),
       item.product_id, receipt.updated_by
FROM fish_erp.import_receipt AS receipt
JOIN fish_erp.import_product AS item ON item.import_receipt_id = receipt.id
WHERE receipt.completed_at IS NOT NULL
  AND (receipt.cancelled_at IS NOT NULL OR receipt.delete_at IS NOT NULL);

-- Backfill ledger xuất kho nếu DB đã có hóa đơn hoàn thành hoặc đã hủy sau hoàn thành.
INSERT INTO fish_erp.inventory_movement (
  id, movement_type, document_type, document_id, document_code,
  quantity_delta, unit_price, occurred_at, product_id, created_by
)
SELECT gen_random_uuid(), 'EXPORT_COMPLETED', 'EXPORT', invoice.id, invoice.invoice_code,
       -item.export_quantity, item.unit_price, COALESCE(invoice.completed_at, invoice.created_at),
       item.product_id, invoice.created_by
FROM fish_erp.export_invoice AS invoice
JOIN fish_erp.export_product AS item ON item.export_invoice_id = invoice.id
WHERE invoice.completed_at IS NOT NULL;

INSERT INTO fish_erp.inventory_movement (
  id, movement_type, document_type, document_id, document_code,
  quantity_delta, unit_price, occurred_at, product_id, created_by
)
SELECT gen_random_uuid(), 'EXPORT_CANCELLED', 'EXPORT', invoice.id, invoice.invoice_code,
       item.export_quantity, item.unit_price, invoice.cancelled_at,
       item.product_id, invoice.updated_by
FROM fish_erp.export_invoice AS invoice
JOIN fish_erp.export_product AS item ON item.export_invoice_id = invoice.id
WHERE invoice.completed_at IS NOT NULL AND invoice.cancelled_at IS NOT NULL;

-- Bảo toàn phần tồn kho đã có trước khi hệ thống bắt đầu ghi InventoryMovement.
-- Phần chênh lệch này là tồn đầu kỳ, không được tính nhầm thành một phiếu nhập mới.
INSERT INTO fish_erp.inventory_movement (
  id, movement_type, document_type, document_id, document_code,
  quantity_delta, unit_price, occurred_at, product_id, created_by
)
SELECT gen_random_uuid(), 'OPENING_BALANCE', 'OPENING', product.id, 'OPENING-BALANCE',
       product.remaining_quantity - COALESCE(movement.quantity, 0), NULL,
       product.created_at, product.id, product.created_by
FROM fish_erp.product AS product
LEFT JOIN (
  SELECT product_id, SUM(quantity_delta) AS quantity
  FROM fish_erp.inventory_movement
  GROUP BY product_id
) AS movement ON movement.product_id = product.id
WHERE product.remaining_quantity <> COALESCE(movement.quantity, 0);

CREATE TABLE fish_erp.document_sequence (
  key VARCHAR(30) NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT document_sequence_pkey PRIMARY KEY (key)
);

INSERT INTO fish_erp.document_sequence(key, value, updated_at)
SELECT LEFT(import_code, 10), MAX(RIGHT(import_code, 4)::integer), NOW()
FROM fish_erp.import_receipt
WHERE import_code ~ '^IMP-[0-9]{6}-[0-9]{4}$'
GROUP BY LEFT(import_code, 10)
ON CONFLICT (key) DO UPDATE SET value = GREATEST(document_sequence.value, EXCLUDED.value);

INSERT INTO fish_erp.document_sequence(key, value, updated_at)
SELECT LEFT(invoice_code, 10), MAX(RIGHT(invoice_code, 4)::integer), NOW()
FROM fish_erp.export_invoice
WHERE invoice_code ~ '^INV-[0-9]{6}-[0-9]{4}$'
GROUP BY LEFT(invoice_code, 10)
ON CONFLICT (key) DO UPDATE SET value = GREATEST(document_sequence.value, EXCLUDED.value);

-- Không cho migration hoàn tất nếu ledger backfill không khớp tồn kho hiện tại.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fish_erp.product AS product
    LEFT JOIN (
      SELECT product_id, SUM(quantity_delta) AS quantity
      FROM fish_erp.inventory_movement
      GROUP BY product_id
    ) AS movement ON movement.product_id = product.id
    WHERE product.remaining_quantity <> COALESCE(movement.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'Không thể migrate: InventoryMovement không khớp Product.remainingQuantity';
  END IF;
END $$;
