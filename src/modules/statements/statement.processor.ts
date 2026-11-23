import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { StatementsService } from './statements.service';

@Processor('statements')
export class StatementProcessor extends WorkerHost {
  private readonly log = new Logger(StatementProcessor.name);

  constructor(private statements: StatementsService) {
    super();
  }

  async process(job: Job<{ statementId: string; password?: string }>) {
    this.log.log(`parse ${job.data.statementId}`);
    await this.statements.process(job.data.statementId, job.data.password);
  }
}
