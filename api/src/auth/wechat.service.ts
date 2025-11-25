import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export type WechatSessionPayload = {
  openId: string;
  unionId?: string;
  sessionKey: string;
};

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async code2Session(code: string): Promise<WechatSessionPayload> {
    const appId = this.config.get<string>('WECHAT_MINI_APPID');
    const secret = this.config.get<string>('WECHAT_MINI_SECRET');

    if (!appId || !secret) {
      throw new Error('WECHAT_MINI_APPID 或 WECHAT_MINI_SECRET 未配置');
    }

    try {
      const { data } = await firstValueFrom(
        this.http.get('https://api.weixin.qq.com/sns/jscode2session', {
          params: {
            appid: appId,
            secret,
            js_code: code,
            grant_type: 'authorization_code',
          },
        }),
      );

      if (data.errcode) {
        const errMsg = `code2Session failed: ${data.errmsg || 'unknown error'} (${data.errcode})`;
        this.logger.error(errMsg);
        throw new Error(errMsg);
      }

      if (!data.openid || !data.session_key) {
        const errMsg = 'code2Session response missing openid/session_key';
        this.logger.error(errMsg);
        throw new Error(errMsg);
      }

      return {
        openId: data.openid,
        unionId: data.unionid,
        sessionKey: data.session_key,
      };
    } catch (error) {
      this.logger.error('调用 code2Session 失败', error.stack);
      throw error;
    }
  }
}
