# Wifi Manager 前端部署说明

## 1. 部署边界

正式环境不运行 Vite 开发服务器。执行构建后，只部署 `dist` 静态文件。

对公网只开放一个 HTTPS 域名，例如：

```text
https://wifi.example.com
```

浏览器访问链路：

```text
/           -> Nginx 静态文件
/api/**     -> Nginx -> gateway-service:8080
/ws/alerts  -> Nginx -> gateway-service:8080 -> monitor-service
```

`8381` 至 `8385`、MySQL、Redis、Nacos 和 MQTT 不应直接暴露到公网。

## 2. 构建前端

首次部署先基于模板创建本机环境文件：

```powershell
Copy-Item .env.example .env
```

正式环境推荐保留同源配置：

```dotenv
VITE_API_BASE_URL=/api
VITE_ALERT_WS_PATH=/ws/alerts
VITE_ALERT_WS_URL=
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors
```

`.env` 不进入 Git。`VITE_*` 在构建时写入静态资源，修改后必须重新执行构建；`WIFI_DEV_*` 只控制本地 Vite 开发服务器。

个人定位通过浏览器 Geolocation API 获取手机 GPS。除浏览器认可的 `localhost` 外，该 API 只在 HTTPS 安全上下文中开放，因此手机通过局域网 IP 的普通 HTTP 开发地址访问时，页面会明确提示无法定位。正式域名必须配置有效 TLS。

默认地图底图使用 OpenStreetMap。面向中国大陆正式运营时，应评估并切换到已获授权、网络稳定的地图服务；切换底图只需修改上述地图环境变量。若改用高德 Web JS API，还需要单独申请 Key 和安全密钥，并在地图适配层处理 WGS-84 与 GCJ-02 坐标差异，不能直接把后端 WGS-84 坐标当作高德坐标绘制。

在前端仓库执行：

```powershell
npm.cmd ci
npm.cmd run build
```

将生成的 `dist` 内容发布到服务器目录，例如：

```text
/var/www/wifi-manager
```

`vite.config.js` 的 `server.host`、`allowedHosts` 和 `proxy` 只在本地开发时生效，不会进入 `dist`。

本地默认 `WIFI_DEV_HOST=127.0.0.1`，因此只显示一个 Local 地址。只有手机或 ESP32 需要直接访问 Vite 时，才在本机 `.env` 临时改成 `0.0.0.0`。

## 3. 配置反向代理

以 [deploy/nginx.conf.example](../deploy/nginx.conf.example) 为基础：

1. 把 `wifi.example.com` 替换为真实域名。
2. 配置有效的 TLS 证书和私钥。
3. 确认 Gateway 只在 Nginx 可访问的可信网络监听 `8080`。
4. 若 Gateway 不在本机，将示例中的 `127.0.0.1:8080` 改成内部服务地址。
5. 保留 `/ws/` 的 Upgrade、Connection 和长超时配置。

前端 API 使用相对路径 `/api`，WebSocket 使用当前页面的同源 `/ws/alerts`。因此 HTTPS 页面会自动使用 `wss://wifi.example.com/ws/alerts`，不需要在构建产物中硬编码服务器地址。

## 4. 配置后端来源白名单

Gateway 和 monitor-service 使用同一组真实前端 Origin：

```text
WIFI_ALLOWED_ORIGIN=https://wifi.example.com
WIFI_ALLOWED_ORIGIN_ALT=https://www.wifi.example.com
```

若只使用一个域名，备用值也应设置为受控的真实域名，不能使用 `*`。生产环境不要填写 `localhost`、局域网 IP 或 `portal.test`。

反向代理会设置真实客户端转发头时，再按后端部署文档评估：

```text
FORWARD_HEADERS_STRATEGY=framework
WIFI_TRUST_PROXY_HEADERS=true
```

启用前必须确保代理覆盖外部传入的 `X-Forwarded-*`，并清除 `X-Gateway-Token`、`X-Internal-Token` 和 `X-User-*` 等可信头。

## 5. 配置 ESP32 Portal

正式固件必须使用手机能够访问的 HTTPS 域名：

```cpp
#define PORTAL_EXTERNAL_URL "https://wifi.example.com/portal"
#define PORTAL_EXTERNAL_DOMAIN "wifi.example.com"
#define PORTAL_SERVER_IPV4 "203.0.113.10"
```

`PORTAL_SERVER_IPV4` 应替换为 Portal 域名对应的稳定公网 IPv4。当前固件只维护一个 Portal IPv4 白名单，因此不能直接依赖会频繁变化或返回多个地址的 CDN。服务器 IP 变化时需要同步更新固件配置；支持动态解析和多地址白名单属于后续固件生产化工作。

本地开发才使用：

```cpp
#define PORTAL_EXTERNAL_URL "http://portal.test:5173/portal"
#define PORTAL_EXTERNAL_DOMAIN "portal.test"
#define PORTAL_SERVER_IPV4 "192.168.137.1"
```

## 6. 最小部署验收

完成部署后验证：

1. 直接访问深层 URL `/app/profile`，刷新后仍返回 Vue 页面。
2. 浏览器的 `/api` 请求只访问正式前端域名，不直接访问 `8080`。
3. 管理员的 `/ws/alerts` 返回 `101 Switching Protocols`，断线后可以恢复。
4. 普通用户不能建立管理员告警 WebSocket。
5. HTTP 自动跳转 HTTPS，页面建立 `wss` 而不是混合内容 `ws`。
6. ESP32 未认证客户端可以打开正式 `/portal`，登录后保留完整查询参数。
7. 公网无法直接访问 `8381` 至 `8385` 和基础设施端口。
8. 手机通过 HTTPS 打开“我的位置”，允许浏览器定位后可选择本人 ACTIVE Session 上报，地图显示最新点和历史轨迹。
