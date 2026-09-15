import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { TeamRateLimitService } from './team-rate-limit.service.js';

@Module({
  imports: [PrismaModule],
  providers: [TeamRateLimitService],
  exports: [TeamRateLimitService],
})
export class TeamLimitsModule {}
