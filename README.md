# cards-viewer

一个以静态站点形式部署的银行卡展示项目。

## 结构

- `assets/`: 卡面图片、机构数据
- `css/`: 页面样式
- `js/`: 页面逻辑与公共工具
- `build.py`: 静态站点构建脚本
- `dist/`: 构建产物目录，仅用于部署

## 构建方式

仓库当前使用 Python 生成部署产物：

```bash
python build.py deploy
```

构建完成后，部署 `dist/` 目录即可。

## 构建流程

● build.py 构建流程总结

  核心入口是 build_to(output_dir) 函数，分为 6 个步骤：

  1. 准备输出目录 (`prepare_output_dir`)

  - deploy 模式：删除并重建 dist/，完整刷新
  - dev 模式：保留 .dev/ 目录，只清理已有的 HTML 和 __reload.txt

  2. 复制静态文件 (copy_static_files)

  - 复制 assets/、css/、js/ 三个目录到输出目录
  - dev 模式下用 sync_directory（增量同步，只复制修改过的文件）
  - deploy 模式下用 shutil.copytree（完整复制）

  3. 构建站点数据 (build_site_data → write_site_data)

  - 读取 manifest.json 获取银行列表
  - 遍历每家银行的 data.json 加载卡片数据
  - 读取 referral.json、footer-links.json、bin-overlays.json、regions.json
  - 所有数据合并为一个 JSON 对象
  - 写入 js/generated/site-data.js，格式为 `window.__CARDS_VIEWER_DATA__ = {...}`

  4. 写入 HTML 页面 (write_html_files)

  - 从 `html/` 读取 5 个页面模板：index、credit、referral、bin、withdrawal
  - 在每个页面 common.js 之前插入预加载数据脚本 site-data.js
  - dev 模式下在 </body> 前注入热重载脚本（每秒轮询 __reload.txt）

  5. 构建 Markdown 文档页

  分两部分：
  - 根目录特殊页面：`docs/link.md` → `link.html`（输出到根目录）
  - 普通文档：`docs/*.md` → `docs/*.html`（遍历所有 .md 文件，`about.md` 除外）

  转换流程：
  1. 提取 front matter（作者、日期等元数据）
  2. 自定义 Markdown 转 HTML 渲染器，支持：
    - 标题自动编号（1, 1.1, 1.1.1）并生成目录侧边栏
    - 表格（支持 colspan/rowspan 通过 < 和 ^ 标记、列对齐）
    - 行内代码、加粗、链接、裸 URL 检测
  3. 套用 `templates/doc-page.html` 模板，注入标题、目录、内容和基路径

  6. 清理旧文档 (dev 模式)

  - 删除 `docs/` 目录下不再有对应 `.md` 的 `.html` 文件

  dev 模式额外功能

  当执行 `python build.py dev` 时，构建完成后还会：
  1. 文件监听：在后台线程 `watch_and_rebuild()` 中每 0.8 秒检查文件时间戳和大小，检测到变化自动重新构建
  2. 热重载：通过 `__reload.txt` 文件的时间戳，浏览器每 1 秒轮询一次，检测到变化自动刷新页面
  3. 启动 HTTP 服务器：默认在 http://127.0.0.1:8000 提供服务，自动打开浏览器

## 开发模式

```bash
python build.py dev
```

然后访问：

- `http://localhost:8000`

## 部署建议

适合直接部署到任意静态托管平台，例如：

- GitHub Pages
- Cloudflare Pages
- Vercel
- Nginx 静态目录
