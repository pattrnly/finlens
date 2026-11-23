import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiProvider, AiProviderSchema } from './ai-provider.schema';
import { AiService } from './ai.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AiProvider.name, schema: AiProviderSchema }])],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
