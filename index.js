import plugin from '../../lib/plugins/plugin.js'
import config from './config.js'
import fetch from 'node-fetch'
import { segment } from 'oicq'
import puppeteer from '../../lib/puppeteer/puppeteer.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class ChatSummary extends plugin {
    constructor() {
        super({
            name: '聊天记录总结',
            dsc: '总结转发聊天记录内容',
            event: 'message',
            priority: 5000,
            rule: [
                {
                    reg: '^总结$',
                    fnc: 'summarize'
                },
                {
                    reg: '^看看这是谁$',
                    fnc: 'identifyImage'
                }
            ]
        })
    }

    async summarize(e) {
        logger.mark('[ChatSummary] 收到总结请求')

        // 检查是否是回复消息 - 支持两种方式
        let replyId = null

        // 方式1: 检查 e.source 对象
        if (e.source && e.source.seq) {
            replyId = e.source.seq
            logger.mark(`[ChatSummary] 从 e.source 获取回复ID: ${replyId}`)
        }
        // 方式2: 从消息中查找 CQ:reply 码
        else {
            const replyMatch = e.raw_message?.match(/\[CQ:reply,id=(-?\d+)\]/)
            if (replyMatch) {
                replyId = replyMatch[1]
                logger.mark(`[ChatSummary] 从 CQ 码获取回复ID: ${replyId}`)
            }
        }

        if (!replyId) {
            logger.mark('[ChatSummary] 不是回复消息，忽略')
            return false
        }

        try {
            // 获取被回复的消息
            logger.mark('[ChatSummary] 正在获取被回复的消息...')
            const replyMsg = await e.bot.sendApi('get_msg', { message_id: parseInt(replyId) })
            if (!replyMsg || !replyMsg.message) {
                logger.mark('[ChatSummary] 无法获取被回复的消息')
                return false
            }

            logger.mark('[ChatSummary] 被回复的消息:', JSON.stringify(replyMsg.message))

            // 检查是否是转发消息（必须先检查）
            const forwardId = this.extractForwardId(replyMsg.message)
            if (!forwardId) {
                logger.mark('[ChatSummary] 未找到转发ID，忽略')
                return false
            }

            logger.mark(`[ChatSummary] 找到转发ID: ${forwardId}`)

            // 获取转发消息内容 - 添加重试机制
            logger.mark('[ChatSummary] 正在获取转发消息内容...')
            let forwardMsg = null
            let lastError = null

            // 尝试最多3次，每次间隔递增
            for (let retry = 0; retry < 3; retry++) {
                try {
                    if (retry > 0) {
                        const delay = retry * 1000 // 1秒、2秒
                        logger.mark(`[ChatSummary] 第 ${retry + 1} 次重试，等待 ${delay}ms...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                    }

                    forwardMsg = await e.bot.sendApi('get_forward_msg', { id: forwardId })

                    if (forwardMsg && forwardMsg.data && forwardMsg.data.messages) {
                        logger.mark(`[ChatSummary] 成功获取转发消息 (尝试 ${retry + 1} 次)`)
                        break
                    }
                } catch (err) {
                    lastError = err
                    logger.warn(`[ChatSummary] 第 ${retry + 1} 次尝试失败:`, err.message)

                    // 如果是 coreInfo 错误，记录详细信息
                    if (err.message && err.message.includes('coreInfo')) {
                        logger.error('[ChatSummary] 检测到 coreInfo 错误，这通常发生在机器人长时间运行后')
                        logger.error('[ChatSummary] 建议：重启机器人或等待片刻后重试')
                    }
                }
            }

            if (!forwardMsg || !forwardMsg.data || !forwardMsg.data.messages) {
                const errorMsg = lastError
                    ? `无法获取转发消息内容\n错误：${lastError.message}\n提示：如果机器人已长时间运行，建议重启后重试`
                    : '无法获取转发消息内容，请稍后重试'
                logger.error('[ChatSummary] 所有重试均失败')
                await e.reply(errorMsg)
                return true
            }

            // 提取所有内容 - LLOneBot 数据格式: data.messages[].content
            const content = await this.extractForwardContent(e.bot, forwardMsg.data.messages)
            logger.mark(`[ChatSummary] 提取内容数量: ${content.length}`)

            if (content.length === 0) {
                await e.reply('转发消息内容为空')
                return true
            }

            await e.reply('正在生成总结...')

            // 调用 LLM API 生成总结
            logger.mark('[ChatSummary] 正在调用 LLM API...')
            const summary = await this.callLLM(content)
            logger.mark('[ChatSummary] API 调用成功')

            // 渲染图片并发送
            logger.mark('[ChatSummary] 正在渲染图片...')
            const img = await this.renderSummary(summary)
            await e.reply([segment.at(e.user_id), img], true)

        } catch (err) {
            logger.error('[ChatSummary] 错误:', err)
            await e.reply(`错误: ${err.message}`)
        }

        return true
    }

    async identifyImage(e) {
        logger.mark('[ChatSummary] 收到图片识别请求')

        // 检查是否是回复消息
        let replyId = null
        if (e.source && e.source.seq) {
            replyId = e.source.seq
        } else {
            const replyMatch = e.raw_message?.match(/\[CQ:reply,id=(-?\d+)\]/)
            if (replyMatch) {
                replyId = replyMatch[1]
            }
        }

        if (!replyId) {
            return false
        }

        try {
            // 获取被回复的消息
            const replyMsg = await e.bot.sendApi('get_msg', { message_id: parseInt(replyId) })
            if (!replyMsg || !replyMsg.message) {
                return false
            }

            // 提取图片 URL
            let imageUrl = null
            for (const seg of replyMsg.message) {
                if (seg.type === 'image') {
                    imageUrl = seg.data?.url || seg.url || seg.file
                    break
                }
            }

            if (!imageUrl) {
                return false
            }

            await e.reply('正在识别图片...')

            // 调用 LLM API 识别图片
            const response = await fetch(`${config.apiUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: config.searchPrompt
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageUrl
                                    }
                                }
                            ]
                        }
                    ],
                    temperature: 0.7
                })
            })

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`)
            }

            const data = await response.json()
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('API 返回格式错误')
            }

            let result = data.choices[0].message.content

            // 移除可能存在的 RELATED_IMAGES 标记
            result = result.replace(/RELATED_IMAGES:.+(?:\n|$)/i, '').trim()

            // 使用图片渲染结果
            logger.mark('[ChatSummary] 正在渲染识别结果...')
            const img = await this.renderIdentifyResult(result, imageUrl)
            await e.reply([segment.at(e.user_id), img], true)

        } catch (err) {
            logger.error('[ChatSummary] 图片识别错误:', err)
            await e.reply(`识别失败: ${err.message}`)
        }

        return true
    }

    /**
     * 从消息中提取转发消息 ID
     */
    extractForwardId(message) {
        for (const seg of message) {
            // 检查 JSON 类型（LLOneBot 格式）
            if (seg.type === 'json') {
                try {
                    const data = JSON.parse(seg.data)
                    if (data.data?.meta?.detail?.resid) {
                        return data.data.meta.detail.resid
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }

            // 检查 XML 类型
            if (seg.type === 'xml') {
                const match = seg.data.match(/resid="([^"]+)"/)
                if (match) {
                    return match[1]
                }
            }

            // 检查 forward 类型（LLOneBot 格式）
            if (seg.type === 'forward') {
                return seg.data?.id || seg.id
            }
        }
        return null
    }

    /**
     * 提取 LLOneBot 转发消息内容
     * messages 格式: [{content: [...], sender: {...}, time: ...}, ...]
     */
    async extractForwardContent(bot, messages, depth = 0) {
        // 防止无限递归
        if (depth > 10) {
            return []
        }

        const content = []

        for (const msg of messages) {
            if (!msg.content) continue

            for (const seg of msg.content) {
                // 文本消息
                if (seg.type === 'text') {
                    content.push({
                        type: 'text',
                        text: seg.data?.text || seg.text
                    })
                }

                // 图片消息
                if (seg.type === 'image') {
                    const url = seg.data?.url || seg.url || seg.file
                    if (url) {
                        content.push({
                            type: 'image_url',
                            image_url: { url }
                        })
                    }
                }

                // 嵌套的转发消息 - 同样添加重试机制
                if (seg.type === 'forward' || seg.type === 'json' || seg.type === 'xml') {
                    const forwardId = this.extractForwardId([seg])
                    if (forwardId) {
                        // 尝试获取嵌套转发消息，最多2次重试
                        for (let retry = 0; retry < 2; retry++) {
                            try {
                                if (retry > 0) {
                                    await new Promise(resolve => setTimeout(resolve, retry * 500))
                                }

                                const forwardMsg = await bot.sendApi('get_forward_msg', { id: forwardId })
                                if (forwardMsg && forwardMsg.data && forwardMsg.data.messages) {
                                    const nested = await this.extractForwardContent(bot, forwardMsg.data.messages, depth + 1)
                                    content.push(...nested)
                                    break
                                }
                            } catch (e) {
                                logger.warn(`[ChatSummary] 无法获取嵌套转发消息 (尝试 ${retry + 1}):`, e.message)
                                if (retry === 1) {
                                    // 最后一次重试也失败，跳过这个嵌套转发
                                    logger.error('[ChatSummary] 跳过嵌套转发消息:', forwardId)
                                }
                            }
                        }
                    }
                }
            }
        }

        return content
    }

    /**
     * 调用 LLM API - 支持视觉模型
     */
    async callLLM(content) {
        // 构建消息内容 - 使用 OpenAI Vision API 格式
        const userContent = []

        // 添加所有文本内容
        const textParts = content.filter(item => item.type === 'text').map(item => item.text)
        if (textParts.length > 0) {
            userContent.push({
                type: 'text',
                text: textParts.join('\n')
            })
        }

        // 添加所有图片
        const images = content.filter(item => item.type === 'image_url')
        for (const img of images) {
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: img.image_url.url
                }
            })
        }

        const messages = [
            {
                role: 'system',
                content: config.systemPrompt
            },
            {
                role: 'user',
                content: userContent
            }
        ]

        logger.mark(`[ChatSummary] 发送内容: ${textParts.length} 段文本, ${images.length} 张图片`)

        const response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                temperature: 0.7
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API 请求失败 (${response.status}): ${errorText}`)
        }

        const data = await response.json()

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API 返回格式错误')
        }

        return data.choices[0].message.content
    }

    /**
     * 渲染总结为图片
     */
    async renderSummary(summary) {
        try {
            // 使用 puppeteer 渲染图片
            const base64 = await puppeteer.screenshot('chat-summary', {
                saveId: 'summary',
                imgType: 'png',
                tplFile: join(__dirname, 'resources', 'template.html'),
                data: {
                    summary: summary
                }
            })

            return base64
        } catch (error) {
            logger.error('[ChatSummary] 渲染图片失败:', error)
            // 如果渲染失败，返回纯文本
            return '\n' + summary
        }
    }

    /**
     * 渲染图片识别结果为图片
     */
    async renderIdentifyResult(result, imageUrl) {
        try {
            logger.mark(`[ChatSummary] 渲染参数 - 结果长度: ${result.length}, 原图URL: ${imageUrl ? '有' : '无'}`)

            // 使用 puppeteer 渲染图片
            const base64 = await puppeteer.screenshot('image-identify', {
                saveId: 'identify',
                imgType: 'png',
                tplFile: join(__dirname, 'resources', 'identify_template.html'),
                data: {
                    result: result,
                    imageUrl: imageUrl,
                    relatedImages: '[]' // 空数组，不显示相关图片
                }
            })

            logger.mark('[ChatSummary] 图片渲染成功')
            return base64
        } catch (error) {
            logger.error('[ChatSummary] 渲染识别结果图片失败:', error)
            // 如果渲染失败，返回纯文本
            return '\n' + result
        }
    }
}