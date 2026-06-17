# Wifi Manager Frontend

Wifi Manager Frontend 是 Wifi Manager 项目的前端管理台，基于 Vue 3 和 Vite 构建。它负责提供登录、注册、个人中心、用户管理、设备管理、访问规则、告警、审计、定位展示等页面，并通过网关与后端微服务交互。

后端项目为 `Wifi_Manager`，默认通过网关 `http://localhost:8080` 提供 API。

## 技术栈

- Vue 3
- Vite
- Vue Router
- Axios
- JavaScript
- CSS

## 已完成功能

### 认证页面

- 用户名密码登录
- 手机号/邮箱密码登录
- 手机号/邮箱验证码登录
- 发送验证码冷却
- 忘记密码 / 重置密码
- 密码可见切换
- 登录失败状态提示
- `ACCOUNT_LOCKED` 等后端登录状态适配

### 会话与路由

- JWT token 本地保存
- token 过期检查
- 401 自动清理登录态
- 多标签页登录/退出同步
- 按角色跳转页面
- 普通用户进入个人中心
- 管理员和超级管理员进入后台管理页

### 管理台页面

- 个人资料
- 用户管理
- 管理员审批
- 设备节点
- 黑名单
- 会话
- 流量
- 访问规则
- 告警
- 审计
- GPS/定位展示

## 项目结构

```text
wifi
├── public
├── src
│   ├── api              API 请求封装
│   ├── components       通用组件
│   ├── router           路由配置
│   ├── utils            会话、头像、请求工具
│   └── views            页面视图
├── vite.config.js       Vite 配置
└── package.json
```

## 本地启动

安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm.cmd run dev
```

构建：

```powershell
npm.cmd run build
```

预览构建结果：

```powershell
npm.cmd run preview
```

## 后端依赖

前端开发环境通过 Vite proxy 访问后端：

```text
/api -> http://localhost:8080
/ws  -> ws://localhost:8384
```

使用前请确认以下后端服务已启动：

```text
gateway-service
auth-service
user-service
admin-service
device-service
monitor-service
```

同时需要 MySQL、Nacos 等基础服务正常运行。

## 账号与角色

当前前端使用单浏览器身份模型：

- token、用户名、昵称、角色保存在 `localStorage`
- 同一浏览器多个标签页共享同一个登录账号
- 登录、退出、资料修改通过 storage event 同步
- 如需同时测试多个账号，请使用不同浏览器、浏览器配置文件或无痕窗口

角色说明：

```text
0 超级管理员
1 管理员
2 普通用户
```

注意：角色 `0` 是有效值，代码中需要使用空值合并逻辑，避免被错误当作假值处理。

## 后续规划

- 优化登录、注册、重置密码页面的交互细节
- 完善头像上传到后端 multipart 接口
- 完善告警和审计详情接口联调
- 增强设备、会话、流量和规则页面的端到端测试
- 配合 ESP32 接入完善 Portal 和设备控制流程

## 说明

该前端项目仍处于持续开发阶段，目前重点是配合后端完成认证、管理台、设备与监控相关页面的基础能力。后续会继续围绕云边协同 WiFi 管控场景完善交互体验和业务闭环。
