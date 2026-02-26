# 视奸我 - 网易云音乐播放状态展示

将网易云音乐播放状态实时展示在个人主页上。

## 项目结构

```
shijian-music/
├── api/                    # API 调试工具
│   ├── music.php       # 音乐数据 API
│   └── debug.html          # 可视化调试面板
└── shijianwomusic/         # BetterNCM 插件
    ├── src/main.tsx        # 插件源码
    └── dist/               # 构建输出（安装此目录）
        ├── main.js
        └── manifest.json
        └──	shijianwo.plugin
```

## 快速开始

### 1. 环境要求
- PHP 7.4+
- Web 服务器 (Apache/Nginx)
- Node.js（用于构建插件）
- [BetterNCM](https://github.com/std-microblock/BetterNCM) >= 0.2.5

### 2. 构建插件

```bash
cd shijianwomusic
npm install
npm run build
```

### 3. 安装 BetterNCM 插件

1. 安装 [BetterNCM](https://github.com/std-microblock/BetterNCM)
2. 在 BetterNCM 设置中点击 "Open Folder" 打开数据目录
3. 创建 `plugins_dev` 文件夹（如果不存在）
4. 将 `shijianwomusic/dist` 目录内的文件复制到 `plugins_dev/shijianwo-music/`
5. 重启网易云音乐

目录结构：
```
BetterNCM/
└── plugins_dev/
    └── shijianwo-music/
        ├── main.js
        └── manifest.json
        └──	shijianwo.plugin
```

### 4. 配置插件

1. 打开网易云音乐
2. 点击右上角 BetterNCM 图标
3. 找到 "视奸我-网易云插件"
4. 点击配置按钮，输入 API 地址：
   ```
   http://your-domain.com/music.php
   ```
5. 保存配置

### 5. 部署主页

将 `my-index` 目录上传到 Web 服务器即可。

## API 接口

### 基础 URL
```
http://your-domain.com/music.php
```

### 接口列表

| 接口 | 说明 |
|------|------|
| `?action=current` | 获取完整播放信息 |
| `?action=song` | 仅获取歌曲信息 |
| `?action=progress` | 仅获取播放进度 |
| `?action=lyrics` | 仅获取歌词 |
| `?action=status` | 获取播放状态 |
| `?action=health` | 健康检查 |

### POST 更新数据
```
POST /music.php?action=update
Content-Type: application/json

{
  "playing": {
    "isPlaying": true,
    "song": {...},
    "progress": {...},
    "lyrics": {...}
  }
}
```

## 调试工具

访问 `http://your-domain.com/api/debug.html` 可视化查看 API 数据。

## 功能特点

- 实时同步播放状态
- 显示歌曲名称、艺术家、专辑
- 播放进度条实时更新
- 歌词预览
- 响应式设计，支持移动端

## 常见问题

### 插件列表中看不到插件
1. 确保安装的是 `dist` 目录内的文件
2. 确保 `manifest.json` 和 `main.js` 在同一目录
3. 重启网易云音乐客户端

### 配置按钮无响应
1. 按 F12 打开开发者工具
2. 查看控制台是否有错误
3. 确保 BetterNCM 版本 >= 0.2.5

### API 连接失败
1. 检查 API 地址是否正确
2. 确保 PHP 服务器正常运行
3. 检查跨域配置

### 歌曲信息为空
1. 确保网易云音乐正在播放歌曲
2. 按 F12 查看控制台日志
3. 检查 BetterNCM API 是否正常返回数据

## 温馨提醒

### 本项目使用AI进行开发

## 许可证

MIT License
