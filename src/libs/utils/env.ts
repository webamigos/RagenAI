export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';

export const isLocalTargetEnv = process.env.TARGET_ENV === 'local';
export const isTestTargetEnv = process.env.TARGET_ENV === 'test';
export const isStagingTargetEnv = process.env.TARGET_ENV === 'staging';
export const isProductionTargetEnv = process.env.TARGET_ENV === 'production';
