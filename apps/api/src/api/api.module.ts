import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { MatchStreamService } from './match-stream.service';

@Module({
  controllers: [ApiController],
  providers: [ApiService, MatchStreamService],
  // PushModule imports this module to build notification titles from match data.
  exports: [ApiService],
})
export class ApiModule {}
