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
