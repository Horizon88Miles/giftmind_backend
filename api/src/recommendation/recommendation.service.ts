import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AnalyzeNiuDto, NLUResultDto, RequestNiuDto } from './dtos/niu.dto';
import { InspirationsService } from '../inspirations/inspirations.service';
import { FormattedItem } from '../inspirations/inspirations.types';
import { GiftPlanResult, PlanGiftDto } from './dtos/plan.dto';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly inspirationsService: InspirationsService,
  ) {}

  private getQwenConfig() {
    const apiKey = this.config.get<string>('QWEN_API_KEY');
    const apiBase = this.config.get<string>('QWEN_API_BASE') || 'https://dashscope.aliyuncs.com/compatible/v1';
    const model = this.config.get<string>('QWEN_MODEL') || 'qwen-plus';
    return { apiKey, apiBase, model };
  }

  private buildPlanPrompt(dto: PlanGiftDto, history: string): { system: string; user: string } {
    const system = `你是专业的礼物策划师，请根据提供的礼物信息与关系背景输出严格的 JSON：
{
  "giftName": "string",
  "pairing": "string",
  "scenarios": ["string", ...],
  "copy": "string"
}
- giftName 需要结合礼物特点起一个好记的名称。
- pairing 说明可以搭配的附加元素或仪式。
- scenarios 至少给出 1 个简短场景描述。
- copy 给出一句完整的话术。
只返回 JSON，不要附加其他文字。`;

    const parts = [
      `礼物：《${dto.itemTitle}》`,
      dto.itemSlogan ? `亮点：${dto.itemSlogan}` : '',
      dto.itemDescription ? `详情：${dto.itemDescription}` : '',
      dto.itemPrice ? `价格：${dto.itemPrice}` : '',
      dto.relationship ? `送礼关系：${dto.relationship}` : '',
      history ? `用户历史：${history}` : '',
    ].filter(Boolean);
    const user = parts.join('\n');
    return { system, user };
  }

  async generatePlanForItem(dto: PlanGiftDto): Promise<GiftPlanResult> {
    const { apiKey, apiBase, model } = this.getQwenConfig();
    if (!apiKey) {
      this.logger.error('QWEN_API_KEY 未配置，返回兜底策划');
      return this.buildFallbackPlan(dto);
    }

    // 使用 InspirationsService 拉取商品详情作为上下文
    let history = '';
    try {
      if (this.inspirationsService?.getItemById) {
        const item = await this.inspirationsService.getItemById(dto.itemId);
        if (item) {
          const story = item.story ?? '';
          const tags = Array.isArray((item as any)?.tags) ? (item as any).tags.join('、') : '';
          history = `${story} ${tags}`.trim();
        }
      }
    } catch (e) {
      this.logger.warn('获取商品详情失败，继续使用传入字段', e?.message || e);
    }

    const { system, user } = this.buildPlanPrompt(dto, history);
    const url = `${apiBase}/chat/completions`;
    try {
      const resp = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.5,
            stream: false,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          },
        ),
      );
      const raw = resp.data?.choices?.[0]?.message?.content ?? '';
      const jsonText = this.extractJson(raw);
      const parsed = JSON.parse(jsonText);
      const plan: GiftPlanResult = {
        giftName: this.pickString(parsed.giftName, dto.itemTitle),
        pairing: this.pickString(parsed.pairing, '搭配一封手写信或温暖的话语'),
        scenarios: this.pickArray(parsed.scenarios),
        copy: this.pickString(parsed.copy, `把心里关于${dto.itemTitle}的那份心意说出来。`),
      };
      if (plan.scenarios.length === 0) {
        plan.scenarios = ['挑一个轻松的时刻，把礼物和祝福一起送上'];
      }
      return plan;
    } catch (error) {
      this.logger.warn('生成礼物策划失败，使用兜底', error?.response?.data || error?.message || error);
      return this.buildFallbackPlan(dto);
    }
  }

  private pickString(value: any, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return fallback;
  }

  private pickArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
    }
    return [];
  }

  private buildFallbackPlan(dto: PlanGiftDto): GiftPlanResult {
    const baseName = dto.itemTitle || '这份礼物';
    return {
      giftName: baseName,
      pairing: '加上一段手写留言或一束小花，营造仪式感。',
      scenarios: ['选择一个轻松的场景，把礼物当面送上并表达心意'],
      copy: `想到你时，总觉得${baseName}最能表达我的心意，想亲手把这份温柔交给你。`,
    };
  }

  async analyzeInput(dto: AnalyzeNiuDto): Promise<NLUResultDto> {
    const { apiKey, apiBase, model } = this.getQwenConfig();
    if (!apiKey) {
      this.logger.error('QWEN_API_KEY 未配置');
      throw new HttpException('模型服务未配置', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const system = `你是一个商品推荐的NLU助手。请根据用户输入提取意图(intent)和结构化槽位(slots)。\n
输出必须是严格的JSON，不要包含任何解释或额外文本。\n
JSON Schema: { "intent": "recommendation|chitchat|clarify|unknown", "slots": { "category": string[], "occasion": string[], "recipient": string[], "interest": string[], "style": string[], "attribute": string[], "price_range": { "min": number, "max": number }, "keyword": string[], "excluded_items": string[] } }\n
如果无法判断某些字段，就使用空数组或省略 price_range。`;
    const user = `用户输入: ${dto.userInput}`;

    const url = `${apiBase}/chat/completions`;
    try {
      const resp = await firstValueFrom(
        this.httpService.post(
          url,
          {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.2,
            stream: false,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          },
        ),
      );

      const raw = resp.data?.choices?.[0]?.message?.content ?? '';
      const jsonText = this.extractJson(raw);
      const parsed: any = JSON.parse(jsonText);
      const intent = parsed.intent ?? 'unknown';
      const slots = (parsed.slots ?? {}) as RequestNiuDto;
      return { intent, slots };
    } catch (e: any) {
      this.logger.warn('NLU解析失败，返回兜底 unknown', e?.response?.data || e?.message || e);
      return { intent: 'unknown', slots: {} as RequestNiuDto };
    }
  }

  async recommendBySlots(slots: RequestNiuDto, limit = 10): Promise<FormattedItem[]> {
    const items = await this.inspirationsService.getItemsList();
    const keywords: string[] = [
      ...(slots.keyword ?? []),
      ...(slots.category ?? []),
      ...(slots.occasion ?? []),
      ...(slots.recipient ?? []),
      ...(slots.interest ?? []),
      ...(slots.style ?? []),
      ...(slots.attribute ?? []),
    ].map(s => String(s).toLowerCase());

    const minPrice = slots.price_range?.min ?? 0;
    const maxPrice = slots.price_range?.max ?? Number.MAX_SAFE_INTEGER;

    const excluded = new Set((slots.excluded_items ?? []).map(id => String(id)));

    const scored = items
      .filter(it => !excluded.has(String(it.id)))
      .filter(it => typeof it.price !== 'number' || (it.price >= minPrice && it.price <= maxPrice))
      .map(it => {
        const haystack = `${it.title} ${it.slogan ?? ''} ${it.story ?? ''}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (kw && haystack.includes(kw)) score += 1;
        }
        if (it.isFeatured) score += 2;
        if (typeof it.price === 'number' && isFinite(it.price) && minPrice < maxPrice && maxPrice !== Number.MAX_SAFE_INTEGER) {
          const mid = (minPrice + maxPrice) / 2;
          const diff = Math.abs(it.price - mid);
          const norm = Math.max(1, mid);
          score += Math.max(0, 1.5 - diff / norm);
        }
        return { item: it, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.item);

    return scored;
  }

  async recommendFromInput(dto: AnalyzeNiuDto): Promise<{
    intent: NLUResultDto['intent'];
    slots: RequestNiuDto;
    items: FormattedItem[];
    explanations: Array<{ itemId: number; reason: string }>;
  }> {
    const nlu = await this.analyzeInput(dto);
    const items = await this.recommendBySlots(nlu.slots);
    const explanations = items.map(it => {
      const reasons: string[] = [];
      const haystack = `${it.title} ${it.slogan ?? ''} ${it.story ?? ''}`.toLowerCase();
      const kws = [
        ...(nlu.slots.keyword ?? []),
        ...(nlu.slots.category ?? []),
        ...(nlu.slots.occasion ?? []),
        ...(nlu.slots.recipient ?? []),
        ...(nlu.slots.interest ?? []),
        ...(nlu.slots.style ?? []),
        ...(nlu.slots.attribute ?? []),
      ].map(s => String(s).toLowerCase());
      const hit = kws.filter(k => k && haystack.includes(k));
      if (hit.length > 0) reasons.push(`与用户偏好匹配：${hit.slice(0, 3).join('、')}`);
      if (typeof it.price === 'number' && nlu.slots.price_range?.min !== undefined && nlu.slots.price_range?.max !== undefined) {
        if (it.price >= (nlu.slots.price_range.min ?? 0) && it.price <= (nlu.slots.price_range.max ?? Number.MAX_SAFE_INTEGER)) {
          reasons.push(`价格符合预算区间`);
        }
      }
      if (it.isFeatured) reasons.push('平台精选好物');
      return { itemId: it.id, reason: reasons.join('；') || '综合匹配度较高' };
    });

    return { intent: nlu.intent, slots: nlu.slots, items, explanations };
  }

  private extractJson(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end >= start) return text.slice(start, end + 1);
    return '{}';
  }
}
