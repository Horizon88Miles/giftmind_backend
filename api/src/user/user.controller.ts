import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from '../auth/dtos/update-profile.dto';
import { UserService } from './user.service';
import { UpdateSettingsDto } from './dtos/update-settings.dto';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('profile')
  async updateProfile(@Req() req: any, @Body() body: UpdateProfileDto) {
    const userId = req.user.id;
    const user = await this.authService.updateProfile(userId, body);
    return { code: 0, message: 'ok', data: user };
  }

  @Get('settings')
  async getSettings(@Req() req: any) {
    const settings = await this.userService.getSettings(req.user.id);
    return { code: 0, message: 'ok', data: settings };
  }

  @Post('settings')
  async updateSettings(@Req() req: any, @Body() body: UpdateSettingsDto) {
    const settings = await this.userService.updateSettings(req.user.id, body);
    return { code: 0, message: 'ok', data: settings };
  }
}
