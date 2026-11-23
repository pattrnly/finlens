import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, map, mergeMap, type Observable } from 'rxjs';
import { toPlain } from './serialize';

@Injectable()
export class PlainInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((data) => from(Promise.resolve(data)).pipe(map((resolved) => toPlain(resolved)))),
    );
  }
}
