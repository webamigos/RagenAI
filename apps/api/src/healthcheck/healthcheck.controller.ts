import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Health')
@SkipThrottle()
@Controller('healthcheck')
export class HealthcheckController {
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns OK if the service is running.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  check() {
    return { status: 'ok' };
  }
}
