# 3DMAKE · 三个小世界

由 Blender 场景导出的 Three.js 网页合集。首页选择场景，观看页顶部可以随时切换。

## 在线访问

https://austenzcy.github.io/3dmake/

| 场景 | 入口 | 操作 |
| --- | --- | --- |
| 樱港 | [打开](https://austenzcy.github.io/3dmake/viewer.html?scene=harbor) | 拖动旋转、滚轮缩放、五个观景角度、动画与海水控制 |
| 记忆小院 | [打开](https://austenzcy.github.io/3dmake/viewer.html?scene=courtyard) | WASD 行走、拖动环顾、E 互动、快速前往房间 |
| 暖夜公寓 | [打开](https://austenzcy.github.io/3dmake/viewer.html?scene=apartment) | 鸟瞰旋转缩放、进入房间漫游、位置小地图 |

按 Esc 释放鼠标。触屏操作见各场景内控件。首次载入需下载约 13–52 MB 模型；需要支持 WebGL 的现代浏览器。浏览器限制鼠标锁定时可拖动环顾。

## 本地运行

在本目录执行 `python3 -m http.server 8000`，打开 http://localhost:8000/ 。请勿直接通过 file:// 打开。

无需安装 npm 依赖或构建，Three.js 运行依赖均随仓库提供。GitHub Pages 使用 `main` 分支根目录部署。

## 目录

- `index.html`、`collection.css`：场景选择首页与通用样式。
- `viewer.html`、`viewer.js`：切换场景的观看页，每次只加载一个场景。
- `scenes/`：三个独立场景的 HTML、JavaScript、样式、GLB 模型及资源。
- `assets/`：模型渲染图与网页预览缩略图。

本仓库发布网页与展示所需模型。原始 Blender 工程保留在本地项目中，不包含原始参考照片、视频、聊天记录、个人文件或登录凭据。场景中的回忆入口为占位内容。

Three.js 采用 MIT 许可证，许可证保留在各场景的 `vendor` 目录。其他模型及场景资产不在此另行授予开放源码许可。
