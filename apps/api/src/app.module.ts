import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { TheSportsDbModule } from './providers/thesportsdb/thesportsdb.module';
import { IngestModule } from './ingest/ingest.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiModule } from './api/api.module';
import { ReplayModule } from './replay/replay.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    DbModule,
    TheSportsDbModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    IngestModule,
    ApiModule,
    ReplayModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
