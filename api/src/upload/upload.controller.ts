import { Controller, Post, UseInterceptors, UploadedFile, Req, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

type UploadedFileType = {
  filename: string;
  size: number;
  mimetype: string;
};

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = extname(file.originalname || '') || '.bin';
    cb(null, `${unique}${ext}`);
  },
});

@Controller('upload')
export class UploadController {
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { storage }))
  async uploadAvatar(@UploadedFile() file: UploadedFileType, @Req() req: any) {
    if (!file) {
      throw new HttpException('未收到上传文件', HttpStatus.BAD_REQUEST);
    }
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = process.env.PUBLIC_API_URL || `${protocol}://${host}`;
    const url = `${baseUrl}/uploads/${file.filename}`;
    return {
      code: 200,
      message: 'ok',
      data: {
        url,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
      },
    };
  }
}
