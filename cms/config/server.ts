export default ({ env }) => {
  const isDev = env('NODE_ENV', 'development') === 'development';
  const defaultDevUrl = isDev ? `http://localhost:${env.int('PORT', 1337)}` : undefined;
  const publicUrl = env('PUBLIC_URL');

  return {
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    ...(publicUrl || defaultDevUrl ? { url: publicUrl || defaultDevUrl } : {}),
    app: {
      keys: env.array('APP_KEYS'),
    },
  };
};
