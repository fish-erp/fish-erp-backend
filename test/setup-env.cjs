process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.APP_TIMEZONE = 'Asia/Ho_Chi_Minh';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://fish_erp:fish_erp@localhost:5433/fish_erp?schema=fish_erp';
process.env.CORS_ORIGINS = 'http://localhost:3001';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_SECONDS = '604800';
process.env.JWT_ISSUER = 'fish-erp-api-test';
process.env.JWT_AUDIENCE = 'fish-erp-client-test';
process.env.SWAGGER_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
