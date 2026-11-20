# 随记 · Inkling

> 安静、本地优先的 Windows 写作应用。数据是透明的 JSON，AI 只负责轻轻回看。

![version](https://img.shields.io/badge/version-2.3.0-c96442?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-2f2a25?style=flat-square)
![react](https://img.shields.io/badge/React-19-2f2a25?style=flat-square)
![ai coded](https://img.shields.io/badge/AI--coded-yes-c96442?style=flat-square)


![首页](docs/screenshots/home-light.webp)

## 写下来，然后被轻轻读到

- **生活 / 科研**：两个完全独立的空间，侧栏滑块切换，数量与名称可自定义
- **AI 回声**：同时读取两个空间，写成一页十几秒的回顾；支持任意 OpenAI 兼容 API
- **透明存储**：一篇文章一个 JSON 文件，目录即数据，无账号无云端
- **安静**：本地服务只绑定 `127.0.0.1`，每日自动备份，不自动调用 AI

> AI coding 作品：想法与审美来自人，代码与文档由 AI 写成。

![深色](docs/screenshots/home-dark.webp)

| | | |
|---|---|---|
| ![编辑器](docs/screenshots/editor.webp) | ![科研空间](docs/screenshots/research.webp) | ![设置](docs/screenshots/settings.webp) |

## 运行

```powershell
cd app
npm install
npm run build
cd ..
powershell -File app\scripts\serve-suiji.ps1 -Root app\dist -DataRoot sync-data -Port 4180
```

打开 `http://127.0.0.1:4180`，首屏向下滚动进入文章列表，侧栏滑块切换空间。

## AI 回声

**设置 → AI**：选择提供商预设（DeepSeek 官方、OpenRouter、Kimi、本地 Ollama、OpenCode Go，或任意 OpenAI 兼容 API），粘贴 Key。只在点击生成时调用，Key 只存本机。

## 开发

```bash
cd app
npm install
npm run dev      # 界面热更新
npm run test     # 29 项测试
```

技术栈：React 19 · TypeScript · Vite · Zustand · Dexie · framer-motion · PowerShell。

## 许可证

代码以 [MIT](LICENSE) 开源；字体遵循各自的 [OFL](app/public/fonts/OFL-LXGW-WenKai.txt) 许可。版本历史见 [CHANGELOG](CHANGELOG.md)。
