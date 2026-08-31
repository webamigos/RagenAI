import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

/**
 * Opt a controller or handler out of `ReplaceIdsInterceptor`. The global
 * interceptor strips `id`/`organization_id`/`project_id` and renames
 * `public_id` → `id` — perfect for our ragen-native REST shape, but
 * wrong for OpenAI-compatible endpoints that need to return `id` fields
 * like `"chatcmpl-..."`, `"file-..."`, `"asst-..."` untouched.
 *
 * Apply at the class level for whole-controller opt-out, or on a
 * specific handler method when only one route needs raw passthrough.
 *
 * @example
 * ```ts
 * @Controller('chat/completions')
 * @SkipResponseTransform()
 * export class ChatCompletionsController { ... }
 * ```
 */
export const SkipResponseTransform = () =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);
