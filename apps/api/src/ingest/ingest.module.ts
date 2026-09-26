import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { PollerService } from './poller.service';
import { AdminController } from './admin.controller';
import { TheSportsDbModule } from '../providers/thesportsdb/thesportsdb.module';

@Module({
  imports: [TheSportsDbModule],
  controllers: [AdminController],
  providers: [IngestService, PollerService],
  exports: [IngestService],
})
export class IngestModule {}
