import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Something went wrong. Please try again.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') message = res;
      else if (typeof res === 'object' && res && 'message' in res) {
        message = (res as { message: string | string[] }).message;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
      this.log.error(exception.stack ?? exception.message);
    }

    const text = Array.isArray(message) ? message.join(', ') : message;
    reply.status(status).send({
      statusCode: status,
      message: text,
      error: typeof exception === 'object' && exception && 'name' in exception
        ? String((exception as { name: string }).name)
        : 'Error',
    });
  }
}
