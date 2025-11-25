import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginSmsDto } from './dtos/login-sms.dto';
import { ConfigService } from '@nestjs/config';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { LoginWechatDto } from './dtos/login-wechat.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('loginSms')
  async loginSms(@Body() body: LoginSmsDto) {
    const envPhone = this.config.get<string>('STUB_PHONE') || '';
    const envCode = this.config.get<string>('STUB_CODE') || '';

    // 开发环境兜底：如果未配置 STUB_PHONE/STUB_CODE，则使用固定验证码 123456，手机号以用户输入为准
    const fallbackCode = '123456';
    const isEnvConfigured = !!envPhone && !!envCode;

    const phone = (body.phone || '').trim();
    const code = (body.code || '').trim();

    if (!phone || !code) {
      return { code: 400, message: 'phone 或 code 缺失' };
    }

    // 简单手机号格式校验（中国大陆 11 位）
    if (!/^1\d{10}$/.test(phone)) {
      return { code: 400, message: '手机号格式不正确' };
    }

    const isValid = isEnvConfigured
      ? phone === envPhone && code === envCode
      : code === fallbackCode;

    if (!isValid) {
      return { code: 401, message: 'Invalid phone or code' };
    }

    // 若已配置 env，落库为 envPhone；否则按用户输入手机号落库
    const loginPhone = isEnvConfigured ? envPhone : phone;

    // 落库用户（按手机号查找，不存在则创建），并返回完整字段
    const user = await this.authService.ensureUserByPhone(loginPhone);
    const accessToken = this.authService.signAccessToken(user);
    const refreshToken = this.authService.signRefreshToken(user);

    return {
      code: 0,
      message: 'ok',
      data: { accessToken, refreshToken, user },
    };
  }

  @Post('loginWechat')
  async loginWechat(@Body() body: LoginWechatDto) {
    const code = (body.code || '').trim();
    if (!code) {
      return { code: 400, message: 'code 缺失' };
    }

    try {
      const { user } = await this.authService.loginWithWechat(code, {
        nickname: body.nickname,
        avatarUrl: body.avatarUrl,
      });

      const accessToken = this.authService.signAccessToken(user);
      const refreshToken = this.authService.signRefreshToken(user);

      return {
        code: 0,
        message: 'ok',
        data: { accessToken, refreshToken, user },
      };
    } catch (error) {
      return { code: 400, message: error.message || '微信登录失败' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    const user = await this.authService.getUserById(req.user.id);
    return { code: 0, message: 'ok', data: user };
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    try {
      console.log('=== REFRESH TOKEN DEBUG START ===');
      console.log('Received refreshToken:', refreshToken ? refreshToken.substring(0, 50) + '...' : 'EMPTY');

      if (!refreshToken) {
        console.log('No refresh token provided');
        return { code: 401, message: 'Refresh token required' };
      }

      const payload = this.authService.verifyRefreshToken(refreshToken);
      if (!payload) {
        console.log('Refresh token verification failed');
        return { code: 401, message: 'Invalid refresh token' };
      }

      console.log('Payload verified successfully, generating new access token...');
      const accessToken = this.authService.signAccessToken(payload);
      console.log('New access token generated successfully');
      console.log('=== REFRESH TOKEN DEBUG SUCCESS ===');
      return { code: 0, message: 'ok', data: { accessToken } };
    } catch (error) {
      console.error('=== REFRESH TOKEN DEBUG ERROR ===');
      console.error('Error in refresh endpoint:', error.message);
      return { code: 500, message: 'Internal server error' };
    }
  }

  @Post('logout')
  async logout(@Req() req: any, @Body('refreshToken') refreshToken: string) {
    try {
      // 从请求头中获取 access token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const accessToken = authHeader.substring(7);
        console.log('Adding access token to blacklist:', accessToken.substring(0, 50) + '...');
        this.authService.blacklistAccessToken(accessToken);
      }

      // 验证并删除 refresh token
      if (refreshToken) {
        const payload = this.authService.verifyRefreshToken(refreshToken);
        if (payload) {
          this.authService.logout(payload.id);
        }
      }
      
      return { code: 0, message: 'ok' };
    } catch (error) {
      console.error('Error in logout:', error.message);
      return { code: 0, message: 'ok' }; // 幂等，即使出错也返回成功
    }
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req: any, @Body() body: UpdateProfileDto) {
    const userId = req.user.id;
    const user = await this.authService.updateProfile(userId, body);
    return { code: 0, message: 'ok', data: user };
  }
}
