import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { StatementsService } from './statements.service';

class CommitDto {
  @IsOptional()
  rowIds?: string[];
  @IsOptional()
  @IsBoolean()
  acceptHighConfidence?: boolean;
  @IsOptional()
  @IsMongoId()
  accountId?: string;
}

class RowPatchDto {
  @IsOptional()
  @IsString()
  type?: string;
  @IsOptional()
  @IsMongoId()
  categoryId?: string;
  @IsOptional()
  @IsMongoId()
  subcategoryId?: string;
  @IsOptional()
  @IsString()
  merchant?: string;
  @IsOptional()
  @IsBoolean()
  excludedFromSpend?: boolean;
}

@Controller('parser-profiles')
@UseGuards(JwtAuthGuard)
export class ParserProfilesController {
  constructor(private svc: StatementsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.listProfiles(user.userId);
  }
}

@Controller('statements')
@UseGuards(JwtAuthGuard)
export class StatementsController {
  constructor(private svc: StatementsService) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.svc.list(user.userId);
  }

  @Get('profiles')
  profiles(@CurrentUser() user: { userId: string }) {
    return this.svc.listProfiles(user.userId);
  }

  @Get(':id/progress')
  progress(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.progress(user.userId, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.cancel(user.userId, id);
  }

  @Delete(':id/transactions')
  unbook(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.unbook(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }

  @Get(':id/original')
  async original(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const file = await this.svc.originalPdf(user.userId, id);
    res.header('Cache-Control', 'private, no-store');
    return new StreamableFile(file.buffer, {
      type: 'application/pdf',
      disposition: contentDisposition(file.filename),
      length: file.buffer.length,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.svc.get(user.userId, id);
  }

  @Post()
  async upload(@CurrentUser() user: { userId: string }, @Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req);
    if (!file) {
      throw new BadRequestException('Please choose a PDF file to upload.');
    }
    return this.svc.upload(user.userId, file, {
      accountId: fields.accountId || undefined,
      password: fields.password || undefined,
    });
  }

  @Post(':id/process')
  process(
    @CurrentUser() _user: { userId: string },
    @Param('id') id: string,
    @Body() body: { password?: string },
  ) {
    return this.svc.process(id, body?.password);
  }

  @Post(':id/recognise')
  recognise(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { providerId?: string },
  ) {
    return this.svc.recognise(user.userId, id, body?.providerId);
  }

  @Patch(':id/rows/:rowId')
  patchRow(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body() dto: RowPatchDto,
  ) {
    return this.svc.patchRow(user.userId, id, rowId, { ...dto });
  }

  @Post(':id/commit')
  commit(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CommitDto,
  ) {
    return this.svc.commit(user.userId, id, dto);
  }
}

async function readMultipart(req: FastifyRequest) {
  let file: { filename: string; buffer: Buffer } | undefined;
  const fields: Record<string, string> = {};

  if (typeof req.parts === 'function') {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        file = { filename: part.filename, buffer: await part.toBuffer() };
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
    return { file, fields };
  }

  const single = await req.file?.();
  if (!single) return { file, fields };
  file = { filename: single.filename, buffer: await single.toBuffer() };
  for (const [key, val] of Object.entries(single.fields ?? {})) {
    const item = Array.isArray(val) ? val[0] : val;
    const value = (item as { value?: string } | undefined)?.value;
    if (value) fields[key] = value;
  }
  return { file, fields };
}

function contentDisposition(name: string) {
  const raw = (name || 'statement.pdf').replace(/[\r\n"]/g, '_').slice(0, 180);
  const fallback = raw.replace(/[^\w.\-]+/g, '_') || 'statement.pdf';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(raw)}`;
}
