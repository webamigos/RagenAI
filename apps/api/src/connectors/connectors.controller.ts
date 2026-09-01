import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service.js';
import { GetAvailableConnectorsService } from './get-available-connectors.service.js';
import { getProviderDefinition } from './provider-definition.js';
import { type McpConnectorProvider } from '../generated/prisma/client.js';
import { RegisterApiKeyDto } from './dto/register-api-key.dto.js';
import { CustomHeaderCredentialsDto } from './dto/custom-header-credentials.dto.js';
import { ToggleConnectorDto } from './dto/toggle-connector.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 *
 * Route surface matches ragen-app's own
 * `src/app/[locale]/(panel)/settings/connectors/actions.ts` Server
 * Actions 1:1 (verified by reading that file) — every `ConnectorsService`
 * method is already org/user-scoped in its own Prisma `where` clause, so
 * (unlike `ProjectsController`) no additional access-control gating was
 * needed here.
 *
 * Not exposed: `GetEnabledConnectorsService` (a chat-pipeline-only
 * helper for `LoadMcpToolsService`, filtered/shaped for that purpose —
 * not what the Settings > Connectors UI calls; `getUserConnectors`
 * already covers the "list my connectors" UI need with a client-safe
 * shape). Google Drive folder import/sync and Fireflies transcript
 * search remain unported — see `ConnectorsService`'s own class-level
 * comment and the ADR's "Drive/Fireflies connector sync checked — not
 * applicable to apps/api" update (both are ragen-app-UI-only features
 * unreachable from any `/v1/*` route, this one included).
 */
@ApiExcludeController()
@Controller('internal/connectors')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class ConnectorsController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly availableConnectors: GetAvailableConnectorsService,
  ) {}

  @Get()
  list(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.connectors.getUserConnectors(context.orgId, context.userId);
  }

  @Get('available')
  available(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.availableConnectors.getAvailableConnectorsForOrg(context.orgId);
  }

  @Post(':provider')
  create(
    @Param('provider') provider: McpConnectorProvider,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.connectors.createConnector(
      context.orgId,
      context.userId,
      provider,
    );
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.connectors.markConnectorConnected(
      id,
      context.orgId,
      context.userId,
    );
  }

  @Delete(':id')
  disconnect(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.connectors.disconnectConnector(
      id,
      context.orgId,
      context.userId,
    );
  }

  @Post(':id/toggle')
  toggle(
    @Param('id') id: string,
    @Body() dto: ToggleConnectorDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.connectors.toggleConnector(
      id,
      context.orgId,
      context.userId,
      dto.enabled,
    );
  }

  /**
   * Mirrors ragen-app's `registerApiKey` Server Action, which routes to
   * `registerApiKeyBearerCommand` for `api_key_bearer` providers (e.g.
   * Fireflies) and `registerApiKeyCommand` for everything else — same
   * branch, here.
   */
  @Post(':provider/api-key')
  registerApiKey(
    @Param('provider') provider: McpConnectorProvider,
    @Body() dto: RegisterApiKeyDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    const providerDef = getProviderDefinition(provider);
    if (providerDef?.authType === 'api_key_bearer') {
      return this.connectors.registerApiKeyBearer(
        context.orgId,
        context.userId,
        provider,
        dto.apiKey,
      );
    }
    return this.connectors.registerApiKey(
      context.orgId,
      context.userId,
      provider,
      dto.apiKey,
    );
  }

  @Post(':provider/custom-header')
  registerCustomHeader(
    @Param('provider') provider: McpConnectorProvider,
    @Body() dto: CustomHeaderCredentialsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.connectors.registerApiKeyCustomHeader(
      context.orgId,
      context.userId,
      provider,
      dto,
    );
  }

  @Post(':provider/test-custom-header')
  testCustomHeader(
    @Param('provider') provider: McpConnectorProvider,
    @Body() dto: CustomHeaderCredentialsDto,
  ) {
    return this.connectors.testCustomHeaderConnection(provider, dto);
  }
}
