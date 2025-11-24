# Giftmind Backend

单仓库包含两个子目录：`api` (NestJS 服务) 与 `cms` (Strapi CMS)。本仓库的 `.git` 位于根目录，只要在这里提交，就会把两个子项目的源码一并推送到远端。

## 目录结构

```
.
├── api            # 核心业务 API (NestJS + Prisma)
├── cms            # Strapi 5 CMS 管理端
├── .gitattributes
└── README.md
```

## 环境要求

- Node.js 18+（Strapi 要求 <= 22.x）
- npm 9+ 或兼容的包管理器
- 本地 PostgreSQL / 其它 Strapi 支持的数据库，用于 `cms`

## 安装依赖

```bash
# API 服务
cd api
npm install

# 或在根目录中一次性安装两个子项目依赖
(cd api && npm install)
(cd cms && npm install)
```

```bash
# CMS 服务
cd cms
npm install
```

## 本地运行

### API (NestJS)

```bash
cd api
cp .env.example .env   # 如果提供了示例文件
npm run start:dev
```

### CMS (Strapi)

```bash
cd cms
cp .env.example .env   # 根据需要调整数据库/云配置
npm run develop        # 或 npm run start 在生产模式
```

## 发布到 GitHub

根目录已经创建 `.gitignore`，会忽略 `node_modules`、构建产物和本地环境文件。需要提交时：

1. 在根目录运行 `git status`（或 GitHub Desktop 中查看 Changes），确认只包含源码改动。
2. 添加 Commit message，例如 `feat: initial import`。
3. 推送到远端（`main` 分支）。GitHub Desktop 只需 `Publish branch` 即可。

如需同时部署两个子项目，请在 CI/CD 中分别进入 `api/` 与 `cms/` 执行构建脚本。
