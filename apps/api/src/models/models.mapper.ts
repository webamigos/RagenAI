import { type ModelRegistryEntry } from '../llm/model-registry.js';

/** OpenAI's `Model` object, as its SDKs type it. */
export type OpenAIModel = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
};

/**
 * `created` is `0` on purpose.
 *
 * The field is required by the OpenAI `Model` type and we do not record when a
 * model was published. Several OpenAI-compatible servers copy a constant epoch
 * out of OpenAI's own response, which produces a plausible date that is simply
 * false; `0` is visibly not a date, and a client sorting by it gets the same
 * arbitrary order either way.
 *
 * `owned_by` carries the catalogue's `origin` rather than `ragen`. It is the
 * one field a client prints next to the id, and the vendor behind the model is
 * more use to someone choosing one than our own name on every row.
 */
export function toOpenAIModel(
  model: ModelRegistryEntry & { value: string },
): OpenAIModel {
  return {
    id: model.value,
    object: 'model',
    created: 0,
    owned_by: model.origin,
  };
}
