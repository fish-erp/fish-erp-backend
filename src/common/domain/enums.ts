export const UserRole = {
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  DELETED: 'DELETED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ProductType = {
  MEDICINE: 'MEDICINE',
  FEED: 'FEED',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const ProductStatus = {
  SELLING: 'SELLING',
  PAUSED: 'PAUSED',
  DISCONTINUED: 'DISCONTINUED',
} as const;

export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const ImportStatus = {
  DRAFT: 'DRAFT',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const ExportType = {
  AT_HOME: 'AT_HOME',
  DELIVERY: 'DELIVERY',
} as const;

export type ExportType = (typeof ExportType)[keyof typeof ExportType];

export const ExportStatus = {
  EDITING: 'EDITING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const InventoryMovementType = {
  OPENING_BALANCE: 'OPENING_BALANCE',
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  IMPORT_CANCELLED: 'IMPORT_CANCELLED',
  EXPORT_COMPLETED: 'EXPORT_COMPLETED',
  EXPORT_CANCELLED: 'EXPORT_CANCELLED',
} as const;

export type InventoryMovementType =
  (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

export const InventoryDocumentType = {
  OPENING: 'OPENING',
  IMPORT: 'IMPORT',
  EXPORT: 'EXPORT',
} as const;

export type InventoryDocumentType =
  (typeof InventoryDocumentType)[keyof typeof InventoryDocumentType];
