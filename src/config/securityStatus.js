const information = (label, tone) => Object.freeze({ label, tone })

export const RULE_TYPES = Object.freeze({
  1: information('域名精确', 'info'),
  2: information('域名包含', 'info'),
  3: information('IP / CIDR', 'warning'),
  4: information('SNI 包含', 'info')
})

export const RULE_ACTIONS = Object.freeze({
  1: information('踢出客户端', 'danger'),
  2: information('阻断流量', 'danger'),
  3: information('仅告警', 'warning')
})

export const ALERT_LEVELS = Object.freeze({
  1: information('低', 'info'),
  2: information('中', 'warning'),
  3: information('高', 'danger')
})

export const ALERT_STATUSES = Object.freeze({
  0: information('未处理', 'warning'),
  1: information('已处理', 'success')
})

function resolve(map, value) {
  return map[String(value)] || information(
    value === null || value === undefined ? '未知' : `未知（${value}）`,
    'neutral'
  )
}

export const resolveRuleType = (value) => resolve(RULE_TYPES, value)
export const resolveRuleAction = (value) => resolve(RULE_ACTIONS, value)
export const resolveAlertLevel = (value) => resolve(ALERT_LEVELS, value)
export const resolveAlertStatus = (value) => resolve(ALERT_STATUSES, value)
