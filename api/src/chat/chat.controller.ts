import { Body, Controller, Get, Post, Query, UseGuards, Request, HttpStatus, Res, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dtos/send-message.dto';
import { SessionListQueryDto } from './dtos/session-list-query.dto';
import { SendMessageQueryDto } from './dtos/send-message-query.dto';
import { SessionMessagesQueryDto } from './dtos/session-messages-query.dto';
import { LatestMessagesQueryDto } from './dtos/latest-messages-query.dto';
import { Message, Session } from './chat.types';
import type { Response } from 'express';

// 统一响应结构
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Post('messages')
  async postMessage(
    @Body() body: SendMessageDto,
    @Request() req: any,
  ): Promise<ApiResponse<Message>> {
    const userId = req.user.id;
    const msg = await this.chatService.sendMessage(
      userId,
      body.message,
      body.sessionId,
      body.priorityContext,
    );
    return {
      code: HttpStatus.OK,
      message: 'ok',
      data: msg,
    };
  }

  // SSE 流式接口：POST /chat/messages/stream
  // 客户端断开连接时，自动中断上游模型流
  @UseGuards(JwtAuthGuard)
  @Post('messages/stream')
  async postMessageStream(
    @Body() body: SendMessageDto,
    @Request() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.id;

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // 心跳，避免代理闲置断开
    const heartbeat = setInterval(() => {
      res.write(`: keep-alive\n\n`);
    }, 15000);

    let finalText = '';
    try {
      const { stream, abort, sessionId, finalize } = await this.chatService.streamMessage(
        userId,
        body.message,
        body.sessionId,
        body.priorityContext,
      );

      const onClose = () => {
        try {
          clearInterval(heartbeat);
        } catch {}
        try {
          abort();
        } catch {}
        try {
          res.end();
        } catch {}
      };
      req.on('close', onClose);

      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.replace(/^data:\s*/, '');
          if (payload === '[DONE]') {
            finalize(finalText);
            res.write(`event: done\n`);
            res.write(`data: {}\n\n`);
            clearInterval(heartbeat);
            res.end();
            return;
          }
          try {
            const json = JSON.parse(payload);
            // OpenAI 兼容：从 delta 或 message.content 提取增量
            const delta = json?.choices?.[0]?.delta?.content
              ?? json?.choices?.[0]?.message?.content
              ?? json?.choices?.[0]?.delta
              ?? '';
            if (typeof delta === 'string' && delta.length > 0) {
              finalText += delta;
              res.write(`event: chunk\n`);
              res.write(`data: ${JSON.stringify({ content: delta, sessionId })}\n\n`);
            }
          } catch (e) {
            // 非 JSON 行，忽略
          }
        }
      });

      stream.on('end', () => {
        finalize(finalText);
        res.write(`event: done\n`);
        res.write(`data: {}\n\n`);
        clearInterval(heartbeat);
        res.end();
      });

      stream.on('error', (err: any) => {
        clearInterval(heartbeat);
        try {
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ message: 'stream_error', detail: String(err?.message ?? err) })}\n\n`);
        } catch {}
        try {
          res.end();
        } catch {}
      });
    } catch (error: any) {
      clearInterval(heartbeat);
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: 'init_error', detail: String(error?.message ?? error) })}\n\n`);
      } catch {}
      try {
        res.end();
      } catch {}
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async getSessions(
    @Query() query: SessionListQueryDto,
    @Request() req: any,
  ): Promise<ApiResponse<{ data: Session[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }>> {
    const userId = req.user.id;
    const result = await this.chatService.getSessionListForUser(
      userId,
      query.page ?? 1,
      query.pageSize ?? 10,
    );
    return {
      code: HttpStatus.OK,
      message: 'ok',
      data: result,
    };
  }

  // 会话消息历史：GET /chat/sessions/:id/messages
  @UseGuards(JwtAuthGuard)
  @Get('sessions/:id/messages')
  async getSessionMessages(
    @Request() req: any,
    @Query() query: SessionMessagesQueryDto,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ data: Message[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }>> {
    const userId = req.user.id;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.chatService.getMessagesBySessionId(userId, id, page, pageSize);
    return {
      code: HttpStatus.OK,
      message: 'ok',
      data: result,
    };
  }

  // 会话最新消息（倒序返回最近 N 条）：GET /chat/sessions/:id/messages/latest
  @UseGuards(JwtAuthGuard)
  @Get('sessions/:id/messages/latest')
  async getLatestSessionMessages(
    @Request() req: any,
    @Query() query: LatestMessagesQueryDto,
    @Param('id') id: string,
  ): Promise<ApiResponse<{ data: Message[]; meta: { page: number; pageSize: number; pageCount: number; total: number } }>> {
    const userId = req.user.id;
    const pageSize = query.pageSize ?? 20;
    const result = await this.chatService.getLatestMessagesBySessionId(userId, id, pageSize);
    return {
      code: HttpStatus.OK,
      message: 'ok',
      data: result,
    };
  }
}
