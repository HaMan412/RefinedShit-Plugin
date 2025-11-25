# RefinedShit-Plugin

基于多模态大模型的聊天总结与图片识别插件

## ！ AI 须知 ！

- 使用 Antigravity 辅助开发
- 代码或存在其他开源插件的内容，非常感谢大佬们开源！
- 包括当前README也是AI生成的（懒得写）
## ✨ 功能特性

- 📝 **聊天记录总结** - 分析转发聊天记录，生成简明扼要的总结
- 🔍 **图片识别** - 通过大模型自带的联网功能查找图中动漫/游戏角色，提供作品名称、角色信息和图片来源
- 🎨 **图片渲染** - 将结果渲染成图片输出结果
- 🔄 **嵌套支持** - 自动处理多层嵌套的转发消息

## 📦 安装方式

### 方法一：Git 克隆

```bash
git clone https://github.com/HaMan412/RefinedShit-Plugin.git
pnpm i
```

### 方法二：手动下载

1. 下载本仓库的 ZIP 文件
2. 解压到 `Yunzai-Bot/plugins/` 目录下
3. 重启 Yunzai-Bot

## ⚙️ 配置说明

编辑 `config.js` 文件以配置 API 信息：

```javascript
export default {
  // OpenAI 兼容 API 地址
  apiUrl: 'https://xxx.xxx.xxx/v1',
  // API 密钥
  apiKey: '',
  // 模型名称
  model: '',
  // 总结提示词（可自定义 AI 人格）
  systemPrompt: '用简明骇要的方式锐评以下聊天记录...',
  // 图片识别提示词
  searchPrompt: '请识别这张图片的内容...'
}
```

> **提示**：你可以使用任何兼容 OpenAI API 的服务

## 📖 使用方法

### 1️⃣ 聊天记录总结

**触发方式：** 回复转发消息并输入 `总结`

![聊天记录总结示例](https://github.com/HaMan412/RefinedShit-Plugin/blob/main/img/1.png)

![总结结果展示](https://github.com/HaMan412/RefinedShit-Plugin/blob/main/img/2.png)

**特点：**
- ✅ 自动提取转发消息中的所有文本和图片
- ✅ 递归处理嵌套的转发消息（最多 10 层）
- ✅ 高亮显示聊天参与者和对话重点

---

### 2️⃣ 图片识别

**触发方式：** 回复图片并输入 `看看这是谁`

![图片识别请求](https://github.com/HaMan412/RefinedShit-Plugin/blob/main/img/3.png)

![识别结果展示](https://github.com/HaMan412/RefinedShit-Plugin/blob/main/img/4.png)

## 🔧 注意事项

- ⚠️ 必须回复**合并转发的消息**才能触发总结功能（普通消息无效）
- ⚠️ 必须回复**图片消息**才能触发识别功能
- ⚠️ 触发词必须严格为 `总结` 或 `看看这是谁`（不能有其他文字）
- ⚠️ 确保配置了正确的 API 密钥和端点
- ⚠️ 转发消息过多时处理时间较长，请耐心等待

## 🛠️ 故障排查

如果插件无法正常工作，请检查：

1. ✅ API 配置是否正确（`config.js` 中的 `apiUrl` 和 `apiKey`）
2. ✅ 网络连接是否正常
3. ✅ 查看 Yunzai 日志中的 `[ChatSummary]` 相关信息
4. ✅ 确认触发词输入正确（不能有多余文字）
5. ✅ 确认回复的消息类型正确（转发消息或图片消息）

## 📄 开源协议

本项目采用 MIT 协议开源
