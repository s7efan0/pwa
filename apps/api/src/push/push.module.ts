import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { ApiModule } from '../api/api.module';

@Module({
  imports: [ApiModule],
  controllers: [PushController],
  providers: [PushService],
})
export class PushModule {}
