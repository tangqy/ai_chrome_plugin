# @wujie/logger-ts

前端日志打桩模块，给 Trae AI skill 生成代码时直接调用，用于输出结构化 `trace / assert / manual feedback` 事件。

## 使用场景

- Web 端组件内打点：关键交互、关键状态回显、接口提交前后、渲染完成点
- 人工验证闭环：人工操作后上报 `manual_feedback`，配合 trace/断言给 AI 自反馈

## 快速开始

```ts
import { aiTrace, aiAssert, aiManualFeedback } from '@wujie/logger-ts'

aiTrace('checkout', 'click_submit', '点击提交订单', { orderId })

aiAssert('checkout', 'submit_button_enabled', submitEnabled, true, submitEnabled, {
  taskId,
  stepId,
})

aiManualFeedback('checkout', 'failed', 'click_no_response', '点击无反应', {
  taskId,
  stepId,
})
```

## 开关与级别

默认行为：

- `enabled`：在 `development / localhost` 环境默认开启（惰性初始化，不会在 import 时读 localStorage）
- `level`：默认 `info`

运行期读取/设置：

```ts
import { getLogConfig, setLogConfig } from '@wujie/logger-ts'

getLogConfig()
setLogConfig({ enabled: true, level: 'debug', persist: true })
```

localStorage（可选）：

- `wujie:logger:enabled`：`1/0` 或 `true/false`
- `wujie:logger:level`：`debug/info/warn/error`

```js
localStorage.setItem('wujie:logger:enabled', '1')
localStorage.setItem('wujie:logger:level', 'warn')
```

重要语义：

- 当 `enabled=false` 或 `level` 不满足阈值时：`aiTrace/aiAssert/aiManualFeedback` 会直接返回 `undefined`，不会写入 sink，也不会做额外处理。

## 在组件中使用（React）

```tsx
import { aiTrace, aiAssert } from '@wujie/logger-ts'

export function SubmitButton(props: { disabled: boolean }) {
  aiAssert('checkout', 'submit_button_disabled_state', !props.disabled, false, props.disabled)

  return (
    <button
      disabled={props.disabled}
      onClick={() => {
        aiTrace('checkout', 'click_submit', '用户点击提交', { disabled: props.disabled })
      }}
    >
      Submit
    </button>
  )
}
```

如果你需要把日志与某个验证任务绑定（task/step）：

```ts
import { aiTrace } from '@wujie/logger-ts'

aiTrace('checkout', 'open_page', '进入页面', undefined, { taskId, stepId, traceId })
```

## 输出落点（sink）

默认 sink 会打印到 `console`。如需把日志转发到 bridge / GUI，可设置全局 sink：

```ts
import { setLogSink } from '@wujie/logger-ts'

setLogSink((event) => {
  // 这里接入 bridge ws / tauri invoke 等
  // event 是结构化对象：traceId/taskId/stepId/module/action/attrs...
})
```

`setLogSink` 对 `aiLogger` 也生效（emit 时动态解析 sink）。

