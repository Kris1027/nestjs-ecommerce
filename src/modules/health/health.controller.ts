import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// HealthCheckService orchestrates running multiple health indicators
// HealthCheck decorator formats the response as a proper health check response
// HealthCheckResult is the return type for health check methods
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

// @Public() bypasses JWT authentication - health checks must be accessible without auth
import { Public } from '../../common/decorators';
// Custom indicators to check service connectivity
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { CacheHealthIndicator } from './indicators/cache.health';

@ApiTags('Health') // Groups endpoints under "Health" in Swagger UI
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly cacheHealth: CacheHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Check if the application is running. Used by Kubernetes/load balancers to detect frozen processes.',
  })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  @ApiResponse({ status: 503, description: 'Application is not responding' })
  checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Check if the application can handle traffic. Verifies database and Redis connectivity.',
  })
  @ApiResponse({ status: 200, description: 'Application is ready to accept traffic' })
  @ApiResponse({ status: 503, description: 'Application dependencies are unavailable' })
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.cacheHealth.isHealthy('cache'),
    ]);
  }
}
