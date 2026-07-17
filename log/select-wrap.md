 筛选栏样式改造与筛选标签方案

 Context

 用户希望更改筛选栏（filter-row）的交互与视觉：
 1. select-wrap 改为左右侧圆弧（pill 形状，border-radius: 999px）
 2. 删除"全部卡组织"、"全部区域"等字样（包括 <span> 标签和下拉框中的默认文案）
 3. 添加筛选后，在下方显示新增的筛选项（以可删除的标签/芯片形式）
 4. 筛选项可删除（点击 × 恢复为"全部"）

 涉及文件

 ┌──────────────────────┬─────────────────────────────────────────────────────────────────┐
 │         文件         │                            改动类型                             │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ css/common.css       │ CSS：select-wrap 改 pill，新增 active-filters / filter-tag 样式 │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ html/index.html      │ HTML：删除 span 标签，改 option 文案，新增 active-filters 容器  │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ html/credit.html     │ HTML：同上                                                      │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ html/withdrawal.html │ HTML：删除 span 标签，新增 active-filters 容器                  │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ js/index.js          │ JS：新增 updateActiveFilters()，调用时机在 render 等            │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ js/credit.js         │ JS：新增 updateActiveFilters()，调用时机在 renderRows 等        │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ css/credit.css       │ CSS：适配新 active-filters 的间距                               │
 ├──────────────────────┼─────────────────────────────────────────────────────────────────┤
 │ css/withdrawal.css   │ CSS：适配新 active-filters 的间距                               │
 └──────────────────────┴─────────────────────────────────────────────────────────────────┘

 不涉及：bin.html、referral.html（无 select-wrap），withdrawal.js（暂不添加芯片以保持简洁）

 具体方案

 1. CSS: .select-wrap 改为 pill 形状

 - border-radius: 8px → border-radius: 999px
 - 调整 padding（去掉左侧多余 padding）
 - 移除 .select-wrap span 相关样式（不再有标签 span）
 - 调整响应式断点中 .select-wrap 相关规则

 2. CSS: 新增 .active-filters 和 .filter-tag

 .active-filters         → display: flex, flex-wrap, gap: 8px, margin-top 调整
 .active-filters:empty   → display: none（无筛选时完全隐藏）
 .filter-tag             → inline-flex, pill 形状, 灰色底, 带 × 按钮
 .filter-tag-remove      → 圆形 × 按钮, hover 变色

 3. HTML 改动

 index.html:
 - 删除所有 <span> 标签（发行方、卡组织、地区、状态）
 - organizationFilter 的 option value="all" 文案 "全部卡组织" → ""
 - statusFilter 的 option value="all" 文案 "全部状态" → ""
 - issuerFilterLabel 初始文案 "全部发行方" → ""
 - regionFilterLabel 初始文案 "全部区域" → ""
 - 在 filter-row 后新增 <div class="active-filters" id="activeFilters"></div>

 credit.html:
 - 删除所有 <span> 标签（发行方、卡组织、地区）
 - 所有 option value="all" 文案改为 ""
 - 新增 active-filters 容器

 withdrawal.html:
 - 删除所有 <span> 标签（取款地区、取出货币、取出金额）
 - 新增 active-filters 容器（暂不留空，保持扩展性）

 4. JS: index.js

 新增 updateActiveFilters() 函数：
 function updateActiveFilters() {
   const container = document.querySelector("#activeFilters");
   if (!container) return;
   container.innerHTML = "";

   // Organization filter
   const org = organizationFilter?.value;
   if (org && org !== "all") {
     container.append(createFilterTag(org, () => {
       organizationFilter.value = "all";
       pendingOrganizationFilterValue = "all";
       render();
     }));
   }

   // Issuer filter
   if (issuerFilterValue !== "all") {
     const label = getIssuerDisplayText(issuerFilterValue);
     if (label && label !== "全部发行方") {
       container.append(createFilterTag(label, () => {
         setIssuerFilterValue("all");
         render();
       }));
     }
   }

   // Region filter
   if (regionFilterValue !== "all") {
     const label = getRegionDisplayText(regionFilterValue);
     if (label && label !== "全部区域") {
       container.append(createFilterTag(label, () => {
         setRegionFilterValue("all");
         render();
       }));
     }
   }

   // Status filter
   const status = statusFilter?.value;
   if (status && status !== "all") {
     const label = STATUS_LABELS[status] || status;
     container.append(createFilterTag(label, () => {
       statusFilter.value = "all";
       render();
     }));
   }
 }

 辅助函数 createFilterTag 可定义在 index.js 或 common.js 中：
 function createFilterTag(label, onRemove) {
   const tag = document.createElement("span");
   tag.className = "filter-tag";
   tag.textContent = label;
   const btn = document.createElement("button");
   btn.className = "filter-tag-remove";
   btn.textContent = "×";
   btn.addEventListener("click", (e) => {
     e.stopPropagation();
     onRemove();
   });
   tag.append(btn);
   return tag;
 }

 在 render() 函数末尾调用 updateActiveFilters()。

 修改 initializeStaticFilters():
 - issuerFilterLabel.textContent = "全部发行方" → ""
 - regionFilterLabel.textContent = "全部区域" → ""
 - organizationFilter 的 createOption("all", "全部卡组织") → createOption("all", "")
 - statusFilter 的 createOption("all", "全部状态") → createOption("all", "")

 修改 getIssuerDisplayText() 和 getRegionDisplayText():
 - value === "all" 返回 "" 而非 "全部发行方" / "全部区域"
 - 无匹配时也返回 ""

 5. JS: credit.js

 新增类似的 updateActiveFilters() 函数，在 renderRows() 末尾调用。

 修改筛选选项初始化：
 - option value="all" 文案改为 ""

 6. 响应式适配

 更新 @media (max-width: 820px) 和 @media (max-width: 560px) 中 .select-wrap 的规则，特别是移除 .select-wrap span
 相关样式。

 验证方法

 1. 运行 python build.py dev 启动开发服务器
 2. 打开 http://127.0.0.1:8000 首页
 3. 验证 select-wrap 显示为 pill 形状（无标签文字）
 4. 选择一个卡组织 → 下方出现可删除的标签
 5. 点击标签的 × → 筛选恢复，标签消失
 6. 同样测试发行方、区域、状态筛选
 7. 验证 credit 页面的三个筛选下拉框
 8. 验证 withdrawal 页面的筛选
 9. 验证 URL 参数回显（刷新页面后筛选状态保持）
 10. 验证暗色模式下的颜色表现



---

● 修改总结

  核心目标

  将首页（index）"卡组织"、"区域"、"状态" 三个筛选器从 <select> 下拉框改为统一的 button + 面板
  形式（与已有的"发行方"筛选器一致），并对全站筛选栏进行样式改造。

  ---
  涉及 9 个文件

  1. html/index.html — 筛选器 HTML 改造

  - "卡组织"、"区域"、"状态" 三个筛选器改为与"发行方"一致的 button + 面板结构
  - 每个筛选器统一使用 <label class="select-wrap issuer-filter"> 包裹
  - 新增 <div class="active-filters" id="activeFilters"></div> 容器用于显示活动的筛选项标签
  - "区域" 筛选器添加 .region-filter class

  2. js/index.js — 核心 JS 逻辑重写

  - 新增筛选器函数：
    - renderOrganizationFilterBanks() / openOrganizationFilterPanel() / closeOrganizationFilterPanel()
    - renderStatusFilterBanks() / openStatusFilterPanel() / closeStatusFilterPanel()
    - getOrganizationOptions() — 获取所有卡组织选项并排序
  - 区域筛选简化：renderRegionFilterBanks() 只显示"中国大陆"和"中国香港"两个选项，删除了省/直辖市细分
  - 追踪变量：引入 organizationValue、statusValue 替代旧的 select DOM 状态
  - 面板互斥：每个面板打开时自动关闭其他面板
  - 消除老旧代码：
    - 删除 updateOrganizationFilterOptions() 所有调用
    - bindEvents() 中删除 [organizationFilter, statusFilter].forEach select 事件处理，替换为 button trigger click 处理器
    - 为所有四个面板添加 click-outside 关闭处理器

  3. css/common.css — 样式改造

  - Pill 形状：.select-wrap 的 border-radius: 8px → 999px，高度调整为 36px
  - 尺寸压缩：width/flex-basis 从 180px → 130px，gap: 8px → 4px，padding 缩减
  - 统一下拉箭头：button.issuer-filter-trigger::after { content: "▼" }
  - 新增筛选标签：.active-filters / .filter-tag / .filter-tag-remove 样式
  - 删除 stale CSS：.select-wrap:has(select)::after 规则

  4. js/common.js — 新增工具函数

  - createFilterTag(label, onRemove) — 创建可删除的筛选标签元素，暴露为 window.cardUtils.createFilterTag

  5. js/credit.js — 信用卡页适配

  - 引入 createFilterTag + updateActiveFilters() 函数
  - 在 renderRows() 末尾调用
  - option value="all" 文案改为空字符串

  6. css/credit.css — 信用卡页样式适配

  - .credit-filter-row .select-wrap 改为 flex: 1 1 130px
  - 响应式断点调整

  7. html/credit.html — 调整 select option 文案

  - 所有 option value="all" 文案改为空
  - 新增 active-filters 容器

  8. html/withdrawal.html — 调整 select option 文案

  - 删除 <span> 标签，新增 active-filters 容器

  9. css/withdrawal.css — 取款页样式适配

  - .withdrawal-filter-row .select-wrap 改为 flex: 0 1 200px

  ---
  交互行为变化

  - 所有四个筛选器均为 button + 面板形式，点击触发下拉面板
  - 面板互斥：一次只能打开一个面板
  - 筛选后下方显示可删除的标签（filter-tag），点击 × 清除对应筛选
  - 占位文字（"发行方"、"卡组织"、"区域"、"状态"）始终显示，不随选择变化
  - URL 参数保持筛选状态，刷新页面可恢复