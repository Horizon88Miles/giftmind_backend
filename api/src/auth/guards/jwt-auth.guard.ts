import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // 检查 token 是否在黑名单中
      if (this.authService.isAccessTokenBlacklisted(token)) {
        console.log('Access token is blacklisted:', token.substring(0, 50) + '...');
        return false;
      }
    }
    
    return super.canActivate(context);
  }
}