export const baseUrl = {
  local: 'http://localhost:3000',
  staging: 'https://ragen-app-staging.up.railway.app',
  production: 'https://app.ragen.ai',
};

type Env = keyof typeof baseUrl;

const TARGET_ENV = process.env.TARGET_ENV! as Env;

export const getBaseUrl = () => {
  return baseUrl[TARGET_ENV];
};
