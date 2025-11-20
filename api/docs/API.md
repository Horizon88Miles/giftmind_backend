# GiftMind Backend API 文档

面向前端联调的接口说明，按模块分组。除特别说明外，受保护接口均需在请求头携带 `Authorization: Bearer <accessToken>`。

## 认证 Auth

- POST `/auth/loginSms`
  - 描述：短信登录（开发环境走 Stub 校验）。
  - Body：`{ phone: string, code: string }`
  - 响应：
    ```json
    { "code": 0, "message": "ok", "data": { "accessToken": "string", "refreshToken": "string", "user": { "id": 1, "phone": "string", "nickname": "string", "gender": true, "meetDays": 0, "avatarUrl": "string" } } }
    ```
    失败：`{ code: 401, message: 'Invalid phone or code' }`

- GET `/auth/me`
  - 描述：获取当前用户信息。
  - 认证：Bearer。
  - 响应：`{ code: 0, message: 'ok', data: User }`（实时查询数据库并计算 `meetDays`）。
  - 说明：`meetDays` 为从注册日期到当前日期的天数，含当日，最少为 1。

- POST `/auth/refresh`
  - 描述：用 `refreshToken` 换取新的 `accessToken`。
  - Body：`{ refreshToken: string }`
  - 响应：`{ code: 0, message: 'ok', data: { accessToken: string } }`；失败：`401/500`。

- POST `/auth/logout`
  - 描述：退出登录；将当前 `accessToken` 加入黑名单，同时删除服务端保存的 `refreshToken`。
  - Header：`Authorization: Bearer <accessToken>`（可选）。
  - Body：`{ refreshToken?: string }`
  - 响应：`{ code: 0, message: 'ok' }`（幂等）。

- PUT `/auth/profile`
  - 描述：更新当前用户资料（全部可选）。
  - 认证：Bearer。
  - Body：`{ nickname?: string, gender?: boolean, avatarUrl?: string }`
  - 响应：`{ code: 0, message: 'ok', data: User }`（`meetDays` 根据注册日期动态计算）。

## 聊天 Chat

- POST `/chat/messages`
  - 描述：非流式对话，返回完整助手消息；自动落库与会话标题更新。
  - 认证：Bearer。
  - Body：`{ message: string, sessionId?: string }`
  - 响应：
    ```json
    { "code": 200, "message": "ok", "data": { "id": "string", "sessionId": "string", "role": "assistant", "content": "string|object", "createdAt": "ISODate" } }
    ```

- POST `/chat/messages/stream`
  - 描述：SSE 流式对话（POST 版），便于自定义请求体；自动心跳与断连清理。
  - 认证：Bearer。
  - Body：`{ message: string, sessionId?: string }`
  - 响应：`text/event-stream`，事件：
    - `event: chunk` → `data: { content: string, sessionId: string }`
    - `event: done` → `data: {}`
    - `event: error` → `data: { message: 'init_error'|'stream_error', detail: string }`

- GET `/chat/messages/stream`
  - 描述：SSE 流式对话（GET 版），兼容浏览器原生 `EventSource`。
  - 认证：Bearer。
  - Query：`{ message: string, sessionId?: string }`
  - 响应：同上（`chunk`/`done`/`error` 事件）。

- GET `/chat/sessions`
  - 描述：分页获取当前用户的聊天会话列表（按 `updatedAt` 降序）。
  - 认证：Bearer。
  - Query：`{ page?: number=1, pageSize?: number=10 }`
  - 响应：
    ```json
    { "code": 200, "message": "ok", "data": { "data": [ { "id": "string", "userId": 1, "title": "string", "createdAt": "ISODate", "updatedAt": "ISODate" } ], "meta": { "page": 1, "pageSize": 10, "pageCount": 1, "total": 1 } } }
    ```

- GET `/chat/sessions/:id/messages`
  - 描述：分页获取某会话的消息历史（按 `createdAt` 正序）。
  - 认证：Bearer。
  - Path：`id: string(sessionId)`
  - Query：`{ page?: number=1, pageSize?: number=20 }`
  - 响应：
    ```json
    { "code": 200, "message": "ok", "data": { "data": [ { "id": "string", "sessionId": "string", "role": "user|assistant|system", "content": "string|object", "createdAt": "ISODate" } ], "meta": { "page": 1, "pageSize": 20, "pageCount": 2, "total": 29 } } }
    ```

- GET `/chat/sessions/:id/messages/latest`
  - 描述：倒序返回某会话最近 N 条消息（总是 `createdAt desc`）。
  - 认证：Bearer。
  - Path：`id: string(sessionId)`
  - Query：`{ pageSize?: number=20 }`
  - 响应：
    ```json
    { "code": 200, "message": "ok", "data": { "data": [ { "id": "string", "sessionId": "string", "role": "user|assistant|system", "content": "string|object", "createdAt": "ISODate" } ], "meta": { "page": 1, "pageSize": 20, "pageCount": 2, "total": 29 } } }
    ```

### SSE 前端示例

```ts
// GET 版：浏览器原生 EventSource
const es = new EventSource(`/chat/messages/stream?message=${encodeURIComponent(input)}&sessionId=${sid || ''}`, { withCredentials: true });
es.addEventListener('chunk', (e) => {
  const { content, sessionId } = JSON.parse(e.data);
  // 追加渲染 content
});
es.addEventListener('done', () => es.close());
es.addEventListener('error', (e) => console.error('sse error', e));

// POST 版：自定义请求体（需自行实现 SSE client 或使用 fetch+ReadableStream）
```

## 收藏 Collect

- POST `/collect`
  - 描述：添加收藏（幂等，仅好物）。
  - 认证：Bearer。
  - Body：`{ itemId: number }`
  - 响应：`{ message: '收藏成功', data: Collect }`

- DELETE `/collect/:itemId`
  - 描述：按好物 ID 取消收藏。
  - 认证：Bearer。
  - Path：`itemId: number`
  - 响应：`{ message: '取消收藏成功' }`

- GET `/collect`
  - 描述：获取收藏列表（按 `createdAt` 降序）。
  - 认证：Bearer。
  - Query：`{ itemId?: number, page?: number=1, pageSize?: number=10 }`
  - 响应：`{ data: Collect[], meta: { pagination: { page, pageSize, pageCount, total } } }`

- GET `/collect/status/:itemId`
  - 描述：检查某好物是否已被当前用户收藏。
  - 认证：Bearer。
  - Path：`itemId: number`
  - 响应：`{ isCollected: boolean, collectId?: number }`

- GET `/collect/stats`
  - 描述：收藏统计（总数）。
  - 认证：Bearer。
  - 响应：`{ totalCount: number }`

`Collect` 结构：
```json
{ "id": 1, "userId": 1, "itemId": 1001, "createdAt": "ISODate", "updatedAt": "ISODate" }
```

说明：
- 当前仅支持单一类型“好物”。
- `POST /collect` 为幂等操作，重复收藏会返回既有记录。
- 去重通过数据库唯一约束 `(userId, itemId)` 保证。
- 列表默认按 `createdAt desc` 排序。
- 目前表内仅存 `createdAt`，`updatedAt` 等同于 `createdAt`（后续如需可扩展）。

## 档案 Archives

- GET `/archives`
  - 描述：获取当前用户的档案列表。
  - 认证：Bearer。
  - 响应：`Archive[]`

- GET `/archives/:id`
  - 描述：按 ID 获取档案详情（含用户归属校验）。
  - 认证：Bearer。
  - Path：`id: number`
  - 响应：`Archive | null`（不存在或无权访问抛 404）。

- POST `/archives`
  - 描述：创建档案。
  - 认证：Bearer。
  - Body：`{ name: string, relationship: 'family'|'friend'|'lover'|'colleague'|'other', event: string, date: string(ISO), tag?: string[] }`
  - 响应：`Archive`

- PUT `/archives/:id`
  - 描述：更新档案。
  - 认证：Bearer。
  - Path：`id: number`
  - Body（全可选）：`{ name?, relationship?, event?, date?, tag? }`
  - 响应：`Archive`

- DELETE `/archives/:id`
  - 描述：删除档案（控制器声明有路由，具体实现请按前端需要联调确认）。
  - 认证：Bearer。
  - Path：`id: number`

- GET `/archives/filter/relationship`
  - 描述：按关系类型筛选（基于当前用户列表内存过滤）。
  - 认证：Bearer。
  - Query：`{ type?: string }`
  - 响应：`Archive[]`

- GET `/archives/filter/tags`
  - 描述：按标签筛选（控制器已声明路由，服务实现待联调确认）。
  - 认证：Bearer。

- GET `/archives/search`
  - 描述：搜索（控制器已声明路由，服务实现待联调确认）。
  - 认证：Bearer。

`Archive` 结构（示例）：
```json
{ "id": 1, "name": "string", "relationship": "friend", "event": "string", "date": "ISODate", "tag": ["string"], "userid": { "id": 1 }, "createdAt": "ISODate", "updatedAt": "ISODate" }
```

## 灵感 Inspirations

- GET `/inspirations/home`
  - 描述：返回首页聚合数据（私密板块、精选好物、每周主题）。
  - 响应：
    ```json
    { "code": 200, "message": "获取首页数据成功", "data": { "privateBoard": { /* Theme|null */ }, "featuredItems": [ /* FormattedItem[] */ ], "weeklyThemes": [ /* Theme[] */ ] } }
    ```

- GET `/inspirations/themes/:id`
  - 描述：获取单个主题详情。
  - Path：`id: number`
  - 响应：`{ code: 200, message: '获取主题详情成功', data: Theme }`（不存在抛 404）。

- GET `/inspirations/items`
  - 描述：获取好物列表（控制器已声明，服务实现见 `InspirationsService`，前端按需联调）。

- GET `/inspirations/items/:id`
  - 描述：获取单个好物详情。
  - Path：`id: number`
  - 响应：`{ code: 200, message: '获取成功', data: FormattedItem }`（不存在抛 404）。

## 统一约定

- 认证说明：`Authorization: Bearer <accessToken>`，登录后从 `/auth/loginSms` 获取。
- 错误返回：各模块抛出 `HttpException` 时，HTTP 状态码将反映错误类型（如 400/401/403/404/500），同时返回 `{ message: string }` 或 `{ code, message }`。
- 聊天持久化：当数据库就绪时消息与会话将落库；失败时自动回退内存，不影响接口返回。
- 会话标题与摘要：消息完成后自动更新会话标题（默认规则生成，可配置使用 LLM）；摘要用于优化上下文（可配置）。
 - 字段约定：`gender` 为布尔值（建议约定 `true=男`、`false=女`），未设置时可为空或省略。