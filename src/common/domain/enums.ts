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
