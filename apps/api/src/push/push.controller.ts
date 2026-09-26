import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PushService, type BrowserSubscription } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** The client needs this to build a subscription. Public by design. */
  @Get('public-key')
  publicKey() {
    return { key: this.push.publicKey };
  }

  @Post('subscribe')
  async subscribe(@Body() sub: BrowserSubscription) {
    const id = await this.push.saveSubscription(sub);
    return { id };
  }

  /**
   * POST rather than GET because the push endpoint goes in the body: it is a
   * capability URL, and putting it in a query string would leak it into
   * access logs, referrers and browser history.
   */
  @Post('following')
  async following(@Body() body: { endpoint: string }) {
    const matchIds = await this.push.followedMatchIds(body.endpoint);
    return { matchIds };
  }

  /** Called by the service worker on `pushsubscriptionchange`. */
  @Post('rotate')
  rotate(
    @Body()
    body: {
      oldEndpoint: string | null;
      subscription: BrowserSubscription;
    },
  ) {
    return this.push.rotateSubscription(body.oldEndpoint, body.subscription);
  }

  /**
   * Bulk follow/unfollow. Declared BEFORE matches/:matchId so 'bulk' is not
   * captured as a match id by the parameterised route.
   */
  @Post('matches-bulk')
  followMany(@Body() body: { endpoint: string; matchIds: string[] }) {
    return this.push.followMatches(body.endpoint, body.matchIds ?? []);
  }

  @Delete('matches-bulk')
  unfollowMany(@Body() body: { endpoint: string; matchIds: string[] }) {
    return this.push.unfollowMatches(body.endpoint, body.matchIds ?? []);
  }

  @Post('matches/:matchId')
  follow(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.push.followMatch(body.endpoint, matchId);
  }

  @Delete('matches/:matchId')
  unfollow(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.push.unfollowMatch(body.endpoint, matchId);
  }
}
