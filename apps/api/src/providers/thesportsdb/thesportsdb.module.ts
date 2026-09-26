import { Module } from '@nestjs/common';
import { TheSportsDbClient } from './thesportsdb.client';

@Module({
  providers: [TheSportsDbClient],
  exports: [TheSportsDbClient],
})
export class TheSportsDbModule {}
