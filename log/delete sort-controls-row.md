● All references are cleaned up. Here's a summary of what was removed:

  html/index.html — 删除了整个 sort-controls-row 区块（卡片类型切换 + 排序方式切换）

  js/index.js — 移除了所有相关代码：
  - sortMode / cardViewMode 状态变量
  - sortToggle / cardViewToggle DOM 引用
  - parseCardViewQueryValue / parseSortQueryValue 函数
  - sortCards / updateSortToggleState / updateCardViewToggleState 函数
  - cardViewMatches 过滤逻辑（在 cardMatches 中）
  - URL 状态中 sort / cardView 参数的读写
  - 排序/视图按钮的事件绑定
  - init() 中的 updateSortToggleState() / updateCardViewToggleState() 调用
  - sortCards() 调用改为直接返回 cards.concat(batch) 和 cards.filter(cardMatches)

  css/common.css — 删除了所有 .sort-toggle-row、.sort-controls-row、.sort-toggle、.sort-toggle-option、.card-view-toggle 相关样式（包括响应式断点中的）