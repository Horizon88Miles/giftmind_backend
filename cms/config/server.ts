export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  
  // ✅ 核心修改：直接读取 'URL'，并给一个本地开发的默认值
  // 这样既匹配服务器上的 .env (URL=https://...), 也能兼顾本地开发 (http://localhost:1337)
  url: env('URL', 'http://localhost:1337'),
  
  app: {
    keys: env.array('APP_KEYS'),
  },
});