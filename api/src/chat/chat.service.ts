import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  Message,
  Session,
  PriorityContext,
  PriorityEntrySource,
  PriorityEntryDetail,
  PrioritySlotStatus,
} from './chat.types';
import { firstValueFrom } from 'rxjs';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // MVP 占位：内存会话历史存储，后续用 Prisma 持久化替换
  private static historyStore = new Map<string, Message[]>();

  private readonly logger = new Logger(ChatService.name);

  private getQwenConfig() {
    const apiKey = this.config.get<string>('QWEN_API_KEY');
    const apiBase = this.config.get<string>('QWEN_API_BASE') || 'https://dashscope.aliyuncs.com/compatible/v1';
    const model = this.config.get<string>('QWEN_MODEL') || 'qwen-plus';
    const systemPrompt = this.config.get<string>('CHAT_SYSTEM_PROMPT') || '你是一个送礼助手小犀，帮助用户完善送礼需求并给出贴心建议。';
    return { apiKey, apiBase, model, systemPrompt };
  }

  private getContextConfig() {
    const maxTokensStr = this.config.get<string>('CHAT_CONTEXT_MAX_TOKENS');
    const reserveTokensStr = this.config.get<string>('CHAT_CONTEXT_RESERVE_TOKENS');
    const maxMessagesStr = this.config.get<string>('CHAT_CONTEXT_MAX_MESSAGES');
    const summaryEnabledStr = this.config.get<string>('CHAT_CONTEXT_SUMMARY_ENABLED');
    const summaryMaxTokensStr = this.config.get<string>('CHAT_CONTEXT_SUMMARY_MAX_TOKENS');
    const summaryUseLLMStr = this.config.get<string>('CHAT_SUMMARY_USE_LLM');
    const titleUseLLMStr = this.config.get<string>('CHAT_TITLE_USE_LLM');

    const maxTokens = Number(maxTokensStr ?? 6000);
    const reserveTokens = Number(reserveTokensStr ?? 1500);
    const maxMessages = Number(maxMessagesStr ?? 12);
    const summaryEnabled = String(summaryEnabledStr ?? 'true') === 'true';
    const summaryMaxTokens = Number(summaryMaxTokensStr ?? 500);
    const summaryUseLLM = String(summaryUseLLMStr ?? 'false') === 'true';
    const titleUseLLM = String(titleUseLLMStr ?? 'false') === 'true';

    return { maxTokens, reserveTokens, maxMessages, summaryEnabled, summaryMaxTokens, summaryUseLLM, titleUseLLM };
  }

  // 简单、高估的 token 估算：按字符数计（更安全，不越界）
  private approxTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length);
  }

  private normalizeEntrySource(source?: PriorityEntrySource): PriorityEntrySource {
    if (source === 'item' || source === 'theme') {
      return source;
    }
    return 'reminder';
  }

  private ensureText(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return fallback;
  }

  private optionalText(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private normalizeEntryDetail(detail?: PriorityEntryDetail): PriorityEntryDetail {
    if (
      detail === 'xiaoxiboard' ||
      detail === 'item_detail' ||
      detail === 'theme_detail' ||
      detail === 'giftmind_tab'
    ) {
      return detail;
    }
    return 'other';
  }

  private buildEntryDetailDirective(detail: PriorityEntryDetail): string | null {
    switch (detail) {
      case 'xiaoxiboard':
        return '入口：用户来自首页提醒卡片，优先确认提醒里的事件是否仍然有效，再顺着用户情绪继续追问。';
      case 'item_detail':
        return '入口：用户在好物详情页发起对话，默认已经看过该礼物，需先确认送礼对象与需求，再决定是否沿用该礼物。';
      case 'theme_detail':
        return '入口：用户从主题页发起对话，沿着该主题延展灵感，保持语气轻松口语化。';
      case 'giftmind_tab':
        return '入口：用户直接打开心礼 Tab，先简短寒暄，再通过提问了解送礼场景与情绪。';
      default:
        return '入口：常规对话，请主动探询背景后再提供建议。';
    }
  }

  private buildSlotGuidance(slotStatus?: PrioritySlotStatus): string | null {
    if (!slotStatus) {
      return null;
    }
    const missing: string[] = [];
    if (!slotStatus.targetFilled) missing.push('送礼对象');
    if (!slotStatus.relationshipFilled) missing.push('与对象关系');
    if (!slotStatus.eventFilled) missing.push('具体场景/事件');
    if (!slotStatus.budgetFilled) missing.push('预算范围');
    if (!slotStatus.interestsFilled) missing.push('兴趣偏好');

    if (missing.length === 0) {
      return '槽位信息较为完整，但仍需用一到两句确认，再给出可执行的送礼建议。';
    }
    return `以下槽位缺失：${missing.join('、')}。请通过 2~3 轮提问补齐，补全前禁止直接推荐或推销。`;
  }

  private normalizeEnvPrompt(prompt?: string | null): string | null {
    if (!prompt) {
      return null;
    }
    const replaced = prompt.replace(/\\n/g, '\n').trim();
    return replaced.length > 0 ? replaced : null;
  }

  private buildSystemPrompt(priorityContext?: PriorityContext): string {
    const { systemPrompt: configuredPrompt } = this.getQwenConfig();
    const introParts: string[] = [];
    const envPrompt = this.normalizeEnvPrompt(configuredPrompt);
    const fallbackPrompt = '你是礼物策划师。任何回答都要帮助用户完成送礼方案。';
    const useFallbackOutput = !envPrompt;
    if (envPrompt) {
      introParts.push(envPrompt);
    } else {
      introParts.push(fallbackPrompt);
    }

    const entrySource = this.normalizeEntrySource(priorityContext?.entrySource);
    const entryDetail = this.normalizeEntryDetail(priorityContext?.entryDetail);
    const infoLines: string[] = [`类型：${entrySource}`];

    if (priorityContext) {
      if (entrySource === 'item') {
        const item = priorityContext.item ?? {};
        const title = this.ensureText(item.title, '心仪礼物');
        const price = this.ensureText(item.price, '价格待定');
        const slogan = this.ensureText(item.slogan, '亮点待补充');
        const description = this.ensureText(item.description, '暂无更多描述');
        infoLines.push(`用户已选定礼物《${title}》，价格 ${price}，亮点 ${slogan}，详情 ${description}。`);
        const relation = this.optionalText(priorityContext.relationship);
        if (relation) {
          infoLines.push(`送礼关系：${relation}。`);
        }
        const interests = this.optionalText(priorityContext.interests);
        if (interests) {
          infoLines.push(`受礼者兴趣：${interests}。`);
        }
        const budget = this.optionalText(priorityContext.budget);
        if (budget) {
          infoLines.push(`整体预算提示：${budget}。`);
        }
      } else if (entrySource === 'theme') {
        const theme = priorityContext.theme ?? {};
        const title = this.ensureText(theme.title, '灵感主题');
        const story = this.ensureText(theme.story, '故事待补充');
        const insight = this.ensureText(theme.insight, '洞察待补充');
        infoLines.push(`用户希望围绕主题「${title}」继续策划，主题故事：${story}。洞察：${insight}。`);
      } else {
        const target = this.ensureText(priorityContext.targetName, '重要的人');
        const relationship = this.ensureText(priorityContext.relationship, '关系待定');
        const eventName = this.ensureText(priorityContext.eventName, '重要日子');
        const interests = this.ensureText(priorityContext.interests, '兴趣未知');
        const budget = this.ensureText(priorityContext.budget, '预算未设置');
        const eventDate = this.ensureText(priorityContext.eventDate, '日期待确认');
        infoLines.push(`即将为【${target}】（${relationship}）的【${eventName}】准备礼物，兴趣 ${interests}，预算 ${budget}，日期 ${eventDate}。`);
        const daysLeft = typeof priorityContext.daysLeft === 'number' && Number.isFinite(priorityContext.daysLeft)
          ? priorityContext.daysLeft
          : undefined;
        if (typeof daysLeft === 'number') {
          infoLines.push(`距离事件约 ${daysLeft} 天。`);
        }
        const note = this.optionalText(priorityContext.note);
        if (note) {
          infoLines.push(`用户备注：${note}。`);
        }
      }
      const hint = this.optionalText(priorityContext.priorityHint);
      if (hint) {
        infoLines.push(`额外提示：${hint}。`);
      }
    } else {
      infoLines.push('未提供额外入口信息，请结合对话自动提炼需求。');
    }

    const entrySection = ['[入口信息]', ...infoLines].join('\n');
    const sections = [...introParts, entrySection];
    const detailDirective = this.buildEntryDetailDirective(entryDetail);
    if (detailDirective) {
      sections.push(detailDirective);
    }
    const slotGuidance = this.buildSlotGuidance(priorityContext?.slotStatus);
    if (slotGuidance) {
      sections.push(slotGuidance);
    }
    sections.push('对话策略：先共情回应，再通过 2~3 轮提问确认送礼对象、关系、场景与预算；槽位不足时严禁直接推荐或给出购买链接。');
    if (useFallbackOutput) {
      sections.push('输出要求：\n1. 先用简短的一句话确认背景。\n2. 接着给出送礼方案（推荐组合、场景、文案等），围绕入口信息展开。');
    }
    const responseConstraint = this.optionalText(priorityContext?.responseConstraint);
    if (responseConstraint) {
      sections.push(`输出长度限制：${responseConstraint}`);
    }

    return sections.filter(Boolean).join('\n\n');
  }

  // 将我们内部 Message 转为 LLM 兼容格式，统一字符串化
  private toLLMMessage(msg: Message): { role: 'system' | 'user' | 'assistant'; content: string } {
    const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // 保留 role 的三种可能值，默认为 'user' 安全兜底
    const role = (msg.role === 'system' || msg.role === 'assistant') ? msg.role : 'user';
    return { role, content: contentStr };
  }

  // 未来接入 DB：按 sessionId+userId 取历史消息（当前占位为空）
  private async getSessionHistory(sessionId: string | undefined, userId: number): Promise<Message[]> {
    if (!sessionId) return [];
    // 优先从数据库读取，会话归属按 userId 限制；失败则回退到内存
    try {
      const prisma: any = this.prisma as any;
      if (prisma?.chatMessage) {
        const rows = await prisma.chatMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'asc' },
          take: 200,
        });
        return rows.map((r: any) => ({
          id: String(r.id),
          sessionId: String(r.sessionId),
          role: r.role ?? 'user',
          content: typeof r.content === 'string' ? r.content : (r.content ?? ''),
          createdAt: new Date(r.createdAt ?? Date.now()),
        }));
      }
    } catch (e) {
      this.logger.warn(`读取会话历史失败，使用内存兜底: ${String((e as any)?.message ?? e)}`);
    }
    return ChatService.historyStore.get(sessionId) ?? [];
  }

  // 标题生成（规则版）：取助手回复的前 30-40 字符，去掉无意义标点与空白
  private deriveTitleRuleBased(text: string): string {
    const raw = (text || '').trim()
      .replace(/^【(.*?)】/g, '$1')
      .replace(/\s+/g, ' ');
    // 按句号/问号/叹号优先截断
    const m = raw.match(/^[^。！？!?\n]{1,40}[。！？!?]?/);
    const title = (m ? m[0] : raw.slice(0, 40)).trim();
    return title.length > 0 ? title : '新会话';
  }

  // 通过 LLM 生成更优标题（可选）
  private async deriveTitleWithLLM(replyText: string): Promise<string> {
    const { apiKey, apiBase } = this.getQwenConfig();
    if (!apiKey) return this.deriveTitleRuleBased(replyText);
    const url = `${apiBase}/chat/completions`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model: this.getQwenConfig().model,
            messages: [
              { role: 'system', content: '请根据用户与助手的对话生成一个不超过18字的中文标题，简洁且能体现主题。只返回标题本身。' },
              { role: 'user', content: replyText.slice(0, 500) },
            ],
            temperature: 0.2,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      const content = response.data?.choices?.[0]?.message?.content;
      const title = typeof content === 'string' ? content.trim() : '';
      return title.length > 0 ? title.slice(0, 40) : this.deriveTitleRuleBased(replyText);
    } catch {
      return this.deriveTitleRuleBased(replyText);
    }
  }

  // 摘要生成：可选 LLM；否则使用规则版拼接最近几条要点
  private async buildSummary(history: Message[], summaryMaxTokens: number, useLLM: boolean): Promise<string | null> {
    if (!history || history.length === 0) return null;
    const latest = history.slice(-5).map(h => {
      const c = typeof h.content === 'string' ? h.content : JSON.stringify(h.content);
      return c.trim();
    }).join('\n');

    if (useLLM) {
      try {
        const { apiKey, apiBase, model } = this.getQwenConfig();
        if (!apiKey) throw new Error('missing apiKey');
        const url = `${apiBase}/chat/completions`;
        const resp = await firstValueFrom(
          this.httpService.post(
            url,
            {
              model,
              messages: [
                { role: 'system', content: `请生成一个不超过${summaryMaxTokens}字的中文要点摘要，突出主题，避免冗余。只返回摘要文本。` },
                { role: 'user', content: latest.slice(0, 1200) },
              ],
              temperature: 0.2,
              stream: false,
            },
            {
              headers: {
                Authorization: `Bearer ${this.getQwenConfig().apiKey}`,
                'Content-Type': 'application/json',
              },
            },
          ),
        );
        const content = resp.data?.choices?.[0]?.message?.content;
        const summary = typeof content === 'string' ? content.trim() : '';
        if (summary.length > 0) return summary.slice(0, summaryMaxTokens);
      } catch {}
    }

    const joined = latest.split(/\n+/).map(s => s.slice(0, 100)).join('\n');
    const fallback = `摘要：${joined}`;
    return fallback.slice(0, Math.max(80, summaryMaxTokens));
  }

  private async buildMessagesFromHistory(
    userText: string,
    sessionId: string | undefined,
    userId: number,
    priorityContext?: PriorityContext,
  ): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
    const systemPrompt = this.buildSystemPrompt(priorityContext);
    const { maxTokens, reserveTokens, maxMessages, summaryEnabled, summaryMaxTokens, summaryUseLLM } = this.getContextConfig();

    const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    let budget = Math.max(1000, maxTokens - reserveTokens); // 留出生成预算

    // 1) system 提示词
    llmMessages.push({ role: 'system', content: systemPrompt });
    budget -= this.approxTokens(systemPrompt);

    // 2) 历史消息（占位：当前无 DB，返回空）
    const history = await this.getSessionHistory(sessionId, userId);
    const sliced = history.slice(-maxMessages);

    // 可选：加入轻量摘要（规则或 LLM）
    if (summaryEnabled) {
      const summary = await this.buildSummary(sliced, summaryMaxTokens, summaryUseLLM);
      if (summary) {
        const summaryTokens = this.approxTokens(summary);
        if (summaryTokens < budget) {
          llmMessages.push({ role: 'system', content: `会话摘要：${summary}` });
          budget -= summaryTokens;
        }
      }
    }

    // 3) 按顺序累加最近原文消息，直到耗尽预算
    for (const h of sliced) {
      const m = this.toLLMMessage(h);
      const t = this.approxTokens(m.content);
      if (t < budget) {
        llmMessages.push(m);
        budget -= t;
      } else {
        // 预算不足则跳过剩余历史
        break;
      }
    }

    // 4) 用户当前输入（必须纳入）
    const userMsg = { role: 'user' as const, content: userText };
    llmMessages.push(userMsg);

    return llmMessages;
  }

  private async callQwen(messages: Array<{ role: string; content: string }>): Promise<string> {
    const { apiKey, apiBase, model } = this.getQwenConfig();
    if (!apiKey) {
      this.logger.error('QWEN_API_KEY 未配置');
      throw new HttpException('模型服务未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = `${apiBase}/chat/completions`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model,
            messages,
            temperature: 0.7,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      // OpenAI 兼容响应结构
      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        this.logger.warn('Qwen 返回的内容不是字符串，使用空字符串作为兜底');
        return '';
      }
      return content;
    } catch (error: any) {
      this.logger.error('调用 Qwen 失败', error?.response?.data || error?.message || error);
      throw new HttpException('模型服务调用失败', HttpStatus.BAD_GATEWAY);
    }
  }

  async sendMessage(
    userId: number,
    message: string,
    sessionId?: string,
    priorityContext?: PriorityContext,
  ): Promise<Message> {
    // 构建对话并调用 Qwen（纳入上下文窗口与预算）
    const msgs = await this.buildMessagesFromHistory(message, sessionId, userId, priorityContext);
    const replyText = await this.callQwen(msgs);

    // 生成 ID（后续用 DB 替换）
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const sid = sessionId ?? `sess_${Math.random().toString(36).slice(2)}`;

    // 记录本轮对话（用户消息 + 助手消息）到内存历史（占位）
    const userMsg: Message = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      sessionId: sid,
      role: 'user',
      content: message,
      createdAt: new Date(),
    };

    const assistantMsg: Message = {
      id,
      sessionId: sid,
      role: 'assistant',
      content: replyText,
      createdAt: new Date(),
    };

    // 优先落库（无 schema 时忽略错误），同时内存兜底
    try {
      const prisma: any = this.prisma as any;
      // 确保会话存在（按 id upsert）
      const initialTitle = '新会话';
      if (prisma?.chatSession) {
        await prisma.chatSession.upsert({
          where: { id: sid },
          create: { id: sid, userId, title: initialTitle, createdAt: new Date(), updatedAt: new Date() },
          update: { updatedAt: new Date() },
        });
      }
      if (prisma?.chatMessage) {
        await prisma.chatMessage.createMany({
          data: [
            { id: userMsg.id, sessionId: sid, role: 'user', content: userMsg.content, createdAt: userMsg.createdAt, userId },
            { id: assistantMsg.id, sessionId: sid, role: 'assistant', content: assistantMsg.content, createdAt: assistantMsg.createdAt, userId },
          ],
        });
      }
    } catch (e) {
      this.logger.warn(`落库失败，将仅记录内存历史: ${String((e as any)?.message ?? e)}`);
    }

    // 尝试优化标题：优先 LLM（可配置），失败回退规则版
    try {
      const { titleUseLLM } = this.getContextConfig();
      const title = titleUseLLM ? await this.deriveTitleWithLLM(assistantMsg.content as string) : this.deriveTitleRuleBased(assistantMsg.content as string);
      const prisma: any = this.prisma as any;
      if (prisma?.chatSession) {
        await prisma.chatSession.update({ where: { id: sid }, data: { title, updatedAt: new Date() } });
      }
    } catch {}

    const existing = ChatService.historyStore.get(sid) ?? [];
    existing.push(userMsg, assistantMsg);
    ChatService.historyStore.set(sid, existing);

    return assistantMsg;
  }

  /**
   * 打开到 Qwen 的流式连接，并返回可读流与中断方法
   * 控制器负责消费流、拼接最终文本，并在完成后调用 finalize() 记录到历史
   */
  async streamMessage(
    userId: number,
    message: string,
    sessionId?: string,
    priorityContext?: PriorityContext,
  ): Promise<{
    stream: Readable;
    abort: () => void;
    sessionId: string;
    finalize: (finalText: string) => void;
  }> {
    const msgs = await this.buildMessagesFromHistory(message, sessionId, userId, priorityContext);
    const { apiKey, apiBase, model } = this.getQwenConfig();
    if (!apiKey) {
      this.logger.error('QWEN_API_KEY 未配置');
      throw new HttpException('模型服务未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const url = `${apiBase}/chat/completions`;
    const abortController = new AbortController();
    try {
      const response = await this.httpService.axiosRef.post(
        url,
        {
          model,
          messages: msgs,
          temperature: 0.7,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          signal: abortController.signal,
        },
      );

      const sid = sessionId ?? `sess_${Math.random().toString(36).slice(2)}`;
      const abort = () => {
        try {
          abortController.abort();
        } catch (e) {
          this.logger.warn(`中断流失败: ${String((e as any)?.message ?? e)}`);
        }
      };
      const finalize = (finalText: string) => {
        const assistantMsg: Message = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
          sessionId: sid,
          role: 'assistant',
          content: finalText,
          createdAt: new Date(),
        };

        const messagesToSave: any[] = [
          { id: assistantMsg.id, sessionId: sid, role: 'assistant', content: assistantMsg.content, createdAt: assistantMsg.createdAt, userId },
        ];

        // 仅当没有优先上下文时，才记录用户消息（避免将上下文作为用户发言）
        if (!priorityContext) {
          const userMsg: Message = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
            sessionId: sid,
            role: 'user',
            content: message,
            createdAt: new Date(),
          };
          messagesToSave.unshift({ id: userMsg.id, sessionId: sid, role: 'user', content: userMsg.content, createdAt: userMsg.createdAt, userId });
        }

        // 异步落库，不阻塞流式响应
        (async () => {
          try {
            const prisma: any = this.prisma as any;
            if (prisma?.chatSession) {
              await prisma.chatSession.upsert({
                where: { id: sid },
                create: { id: sid, userId, title: '新会话', createdAt: new Date(), updatedAt: new Date() },
                update: { updatedAt: new Date() },
              });
            }
            if (prisma?.chatMessage) {
              await prisma.chatMessage.createMany({
                data: messagesToSave,
              });
            }
            // 异步更新标题
            const { titleUseLLM } = this.getContextConfig();
            const title = titleUseLLM ? await this.deriveTitleWithLLM(finalText) : this.deriveTitleRuleBased(finalText);
            if (prisma?.chatSession) {
              await prisma.chatSession.update({ where: { id: sid }, data: { title, updatedAt: new Date() } });
            }
          } catch (e) {
            this.logger.warn(`异步落库或标题更新失败: ${String((e as any)?.message ?? e)}`);
          }
        })();
      };

      return { stream: response.data as Readable, abort, sessionId: sid, finalize };
    } catch (error: any) {
      this.logger.error('打开 Qwen 流式连接失败', error?.response?.data || error?.message || error);
      throw new HttpException('模型服务调用失败', HttpStatus.BAD_GATEWAY);
    }
  }

  async getSessionListForUser(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<{ data: Session[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }> {
    // 优先从数据库分页读取，会话归属按 userId；失败回退为空
    try {
      const prisma: any = this.prisma as any;
      if (prisma?.chatSession) {
        const [items, total] = await Promise.all([
          prisma.chatSession.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.chatSession.count({ where: { userId } }),
        ]);

        const pageCount = Math.ceil((total || 0) / pageSize);
        const data: Session[] = (items || []).map((s: any) => ({
          id: String(s.id),
          userId: Number(s.userId ?? userId),
          title: s.title ?? '',
          createdAt: new Date(s.createdAt ?? Date.now()),
          updatedAt: new Date(s.updatedAt ?? Date.now()),
        }));
        return { data, meta: { page, pageSize, pageCount, total } };
      }
    } catch (e) {
      this.logger.warn(`读取会话列表失败，返回空列表: ${String((e as any)?.message ?? e)}`);
    }
    const total = 0;
    const pageCount = 0;
    return { data: [], meta: { page, pageSize, pageCount, total } };
  }

  /**
   * 获取某会话的消息历史（分页），优先从数据库读取，失败则回退内存
   */
  async getMessagesBySessionId(
    userId: number,
    sessionId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ data: Message[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }> {
    const prisma: any = this.prisma as any;
    let total = 0;
    let items: Array<{ id: string; sessionId: string; role: string; content: string; createdAt: Date; userId?: number }> = [];

    try {
      if (prisma?.chatMessage) {
        total = await prisma.chatMessage.count({ where: { sessionId, userId } });
        items = await prisma.chatMessage.findMany({
          where: { sessionId, userId },
          orderBy: { createdAt: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });
      } else {
        // 无数据库模型时，回退内存历史
        const all = ChatService.historyStore.get(sessionId) ?? [];
        total = all.length;
        items = all
          .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
          .map(m => ({
            id: m.id,
            sessionId: m.sessionId,
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            createdAt: m.createdAt,
            userId,
          }));
      }
    } catch (e) {
      // 数据库异常时也回退内存
      const all = ChatService.historyStore.get(sessionId) ?? [];
      total = all.length;
      items = all
        .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
        .map(m => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          createdAt: m.createdAt,
          userId,
        }));
    }

    const data: Message[] = items.map(m => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as any,
      content: m.content,
      createdAt: new Date(m.createdAt),
    }));
    const pageCount = Math.ceil((total || 0) / pageSize);
    return { data, meta: { page, pageSize, pageCount, total } };
  }

  /**
   * 获取某会话的最新消息（倒序），总是返回最近 N 条
   */
  async getLatestMessagesBySessionId(
    userId: number,
    sessionId: string,
    pageSize = 20,
  ): Promise<{ data: Message[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }> {
    const prisma: any = this.prisma as any;
    let total = 0;
    let items: Array<{ id: string; sessionId: string; role: string; content: string; createdAt: Date; userId?: number }> = [];

    try {
      if (prisma?.chatMessage) {
        total = await prisma.chatMessage.count({ where: { sessionId, userId } });
        items = await prisma.chatMessage.findMany({
          where: { sessionId, userId },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: pageSize,
        });
      } else {
        const all = (ChatService.historyStore.get(sessionId) ?? []).filter(m => (m as any).userId === undefined || (m as any).userId === userId);
        total = all.length;
        items = all
          .slice()
          .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
          .slice(0, pageSize)
          .map(m => ({
            id: m.id,
            sessionId: m.sessionId,
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            createdAt: m.createdAt,
            userId,
          }));
      }
    } catch (e) {
      const all = (ChatService.historyStore.get(sessionId) ?? []).filter(m => (m as any).userId === undefined || (m as any).userId === userId);
      total = all.length;
      items = all
        .slice()
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
        .slice(0, pageSize)
        .map(m => ({
          id: m.id,
          sessionId: m.sessionId,
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          createdAt: m.createdAt,
          userId,
        }));
    }

    const data: Message[] = items.map(m => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as any,
      content: m.content,
      createdAt: new Date(m.createdAt),
    }));
    const pageCount = Math.ceil((total || 0) / pageSize);
    return { data, meta: { page: 1, pageSize, pageCount, total } };
  }

  /**
   * 附加一条助手消息到会话历史（用于持久化推荐卡片等结构化内容）
   */
  async appendAssistantMessage(
    userId: number,
    sessionId: string,
    content: any,
  ): Promise<Message> {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    const assistantMsg: Message = {
      id,
      sessionId,
      role: 'assistant',
      content: contentStr,
      createdAt: now,
    };

    // 优先落库，失败回退内存
    try {
      const prisma: any = this.prisma as any;
      if (prisma?.chatSession) {
        await prisma.chatSession.upsert({
          where: { id: sessionId },
          create: { id: sessionId, userId, title: '新会话', createdAt: now, updatedAt: now },
          update: { updatedAt: now },
        });
      }
      if (prisma?.chatMessage) {
        await prisma.chatMessage.create({
          data: { id, sessionId, role: 'assistant', content: contentStr, createdAt: now, userId },
        });
      }
    } catch (e) {
      this.logger.warn(`appendAssistantMessage 落库失败，使用内存兜底: ${String((e as any)?.message ?? e)}`);
    }

    const existing = ChatService.historyStore.get(sessionId) ?? [];
    existing.push(assistantMsg);
    ChatService.historyStore.set(sessionId, existing);

    return assistantMsg;
  }
}
