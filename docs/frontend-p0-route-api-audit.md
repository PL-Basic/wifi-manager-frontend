# Frontend P-0 route and API audit

This checklist records the implemented F-8 routes against real backend APIs. A route is retained only when its primary workflow has a real endpoint and explicit loading, empty, error, and permission behavior.

## Public and authentication

- `/login`: login, code login, code send, and `GET /auth/oauth/providers`; OAuth buttons fail closed and show configured state.
- `/register`: `POST /auth/register`; success and field/API errors are visible.
- `/forgot-password`: code send and `POST /auth/reset-password`; `?manage=1` supports an authenticated user entering from account security.
- `/oauth-complete/:provider`: provider whitelist plus real callback endpoint.
- `/portal`: authenticated Portal authorization and status polling; missing device context and backend failures are explicit.

## Personal workspace

- `/app/profile`: self profile, avatar, orders, refunds, and account navigation.
- `/app/account-security`: social identity list/bind/unbind, OAuth availability, password management entry, and `POST /users/{userId}/purge-requests`.
- `/app/connections`: self `GET /sessions`, `POST /sessions/{sessionId}/logout`, `GET /traffic`, and `GET /client-signals`; each data set can independently be empty or fail.
- `/app/location`: consent, ACTIVE Session location report, history, and history deletion. Browser HTTPS/security context and geolocation permission failures are explicit.
- `/app/purchase`, `/app/entitlements`, `/app/orders`, `/app/orders/:orderNo`, `/app/refunds`, `/app/refunds/:refundNo`: real entitlement APIs. Real payment is unavailable and must not be represented as successful.

## Admin and super-admin workspace

- `/app/overview`: admin-only health, dashboard summary, recent devices, and command status. Gateway reachability uses `GET /health/gateway`, independent of user-service.
- `/app/network/*`: admin-only device, client signal, Session, traffic, command, and staged WiFi configuration APIs.
- `/app/security/*`: admin-only rules, blacklist, alerts, and audits; detail drawers use real detail APIs.
- `/app/operations/users*`: admin-only user operations; role 0 remains a valid value and role 1 cannot mutate another administrator or the super administrator.
- `/app/operations/approvals`: role 0 only in route and navigation.
- `/app/operations/refunds`: admin list and real detail API. Review is real; payment execution displays `当前服务未提供` and cannot create a fake success.
- `/app/insights/*`: admin-only GIS, signal/traffic analytics, and geofence APIs.

## Shared runtime states

- API connectivity distinguishes browser offline, Gateway unreachable, Gateway/downstream degraded, and online.
- Alert WebSocket is admin-only, uses JWT subprotocol, JSON PING/PONG, exponential reconnect, explicit status, and manual retry.
- Route guards use nullish role handling so role `0` is never replaced by a default.
- Tables and drawers use horizontal overflow or responsive single-column layouts on narrow screens.
- Confirm dialogs are teleported above business drawers; destructive actions require explicit confirmation.
- Unconfigured or unavailable capabilities are disabled or show an error; no route uses mock rows or fabricated success state.
