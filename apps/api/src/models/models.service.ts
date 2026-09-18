import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { gatewayFromEnv } from '@ragenai/llm-gateway';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import {
  selectableModels,
  type ModelRegistryEntry,
} from '../llm/model-registry.js';
import { type ApiContext } from '../common/types/api-context.js';
import { toOpenAIModel, type OpenAIModel } from './models.mapper.js';

type CatalogueModel = ModelRegistryEntry & { value: string };

/**
 * Which models this caller may ask for.
 *
 * Three things already answer a version of "which models exist" and none of
 * them answers this one alone: `MODEL_REGISTRY` says how a model is presented,
 * `infra/llm-gateway/routes.yaml` says which upstream serves it (ADR-49), and
 * `OrganizationSettings.allowedModels` says what an administrator permits.
 * This endpoint is the intersection, so a model it lists is one the caller can
 * actually use — anything else hands them a 400 on the first call instead of
 * an absence they can see.
 *
 * The key's `knowledgeScope` does not narrow this: a scope says which
 * documents a key answers from, and models are not assistants.
 */
@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);

  constructor(
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  async list(context: ApiContext): Promise<OpenAIModel[]> {
    const allowed = await this.organizationSettings.getAllowedModels(
      context.orgId,
    );

    // Empty means no restriction, not "nothing allowed" — see
    // `getAllowedModels`.
    const models =
      allowed.length > 0
        ? this.servedModels().filter((model) => allowed.includes(model.value))
        : this.servedModels();

    return models.map(toOpenAIModel);
  }

  async get(id: string, context: ApiContext): Promise<OpenAIModel> {
    const model = (await this.list(context)).find((m) => m.id === id);
    if (!model) {
      // Deliberately the same answer for "no such model" and "not on your
      // organization's allowlist": the second is another tier's configuration,
      // and distinguishing them would confirm the id is real.
      throw new NotFoundException(`Model '${id}' not found`);
    }
    return model;
  }

  /**
   * The catalogue, narrowed to what this deployment can actually serve.
   *
   * Mirrors apps/web's `gatewayModels()`, including its fallback: an
   * unreadable route table, or one that intersects the catalogue emptily, logs
   * and yields the whole catalogue rather than an empty list. An empty picker
   * reads as "this product is broken", and the model call itself still fails
   * loudly per model, so the failure stays visible where it is actionable.
   */
  private servedModels(): CatalogueModel[] {
    const catalogue = selectableModels();

    try {
      const served = new Set(gatewayFromEnv().availableModels());
      const offered = catalogue.filter((model) => served.has(model.value));

      if (offered.length === 0) {
        this.logger.warn(
          `Gateway serves no model the catalogue knows about (${served.size} routes) — falling back to the full catalogue`,
        );
        return catalogue;
      }
      return offered;
    } catch (error) {
      this.logger.warn(
        `Could not read the gateway route table — falling back to the full catalogue: ${String(error)}`,
      );
      return catalogue;
    }
  }
}
