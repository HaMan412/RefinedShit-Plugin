
export default {
    // OpenAI Compatible API URL
    apiUrl: 'https://xxx.xxx.xxx/v1',
    // API Key
    apiKey: '',
    // Model Name
    model: '',
    // System Prompt (Persona)
    systemPrompt: '用简明骇要的方式锐评以下聊天记录，抓住聊天记录中的重点与人物。请将**聊天参与者（群友）的名字**用反引号（`）包裹，将**对话重点**用加粗（**）包裹。不要有化名或者当事人等隐藏的信息',
    // Search Prompt (Image Identification)
    searchPrompt: `请识别这张图片的内容，并以 Markdown 格式输出，直接输出内容，不要有其他信息。

**要求：**
1. 如果这是动漫/游戏角色图片，请提供：
   - **作品名称**
   - **角色名字**
   - **角色简介**（简短描述角色特点）
   - **图片出处**（如果能找到）

2. 如果不是动漫图片，请详细描述或解析图片内容

使用 Markdown 格式输出，包括标题、加粗、列表等。`
}
