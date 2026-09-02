variable "kubeconfig_path" {
  description = "Path to the kubeconfig for the target cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = <<-EOT
    Kubeconfig context to deploy into. Required, with no default, on purpose:
    the default context is whatever was used last, and this module creates a
    namespace and a release. Naming it makes the target a decision rather than
    an accident.
  EOT
  type        = string
  nullable    = false

  validation {
    condition     = trimspace(var.kube_context) != ""
    error_message = "kube_context must name a context; an empty string leaves both providers unconfigured and they fall back to the current context."
  }
}

variable "namespace" {
  description = "Namespace to create and deploy into."
  type        = string
  default     = "ragen"
}

variable "release_name" {
  description = "Helm release name. Also prefixes every object the chart creates."
  type        = string
  default     = "ragen"
}

variable "chart_path" {
  description = "Path to the chart. Defaults to the one in this repository."
  type        = string
  default     = "../helm/ragen"
}

variable "image_registry" {
  description = "Registry holding the five app images, e.g. ghcr.io/webamigos."
  type        = string
}

variable "image_tag" {
  description = "Tag for the app images. Empty uses the chart's appVersion."
  type        = string
  default     = ""
}

variable "values_files" {
  description = <<-EOT
    Extra chart values files, applied in order after the defaults. This is
    where environment-specific configuration belongs — managed database URLs,
    ingress hosts, replica counts — rather than as more variables here.
  EOT
  type        = list(string)
  default     = []
}

variable "secrets" {
  description = <<-EOT
    Every key the pods read from their Secret.

    This module writes them itself and points the chart at the result via
    `existingSecret`, instead of letting the chart generate them. That is the
    right split for anything long-lived: a generated secret lives only in the
    cluster, so it cannot be recovered, rotated from here, or shared with
    another release.

    It must therefore be complete. At minimum: POSTGRES_PASSWORD,
    BETTER_AUTH_SECRET, SECRET_KEY, INTERNAL_API_SECRET, SESSION_AUTH_SECRET,
    WORKER_SECRET_KEY, LITELLM_MASTER_KEY — plus whichever provider keys the
    deployment uses (OPENAI_API_KEY, GOOGLE_*, SCW_API_KEY).

    One conditional key: if a values file sets `temporal.database.password`,
    the chart reads Temporal's password from TEMPORAL_POSTGRES_PASSWORD instead
    of POSTGRES_PASSWORD, so that key has to be here too. Setting it in values
    while managing secrets here is contradictory — put the password in this map
    and leave the values entry alone — but the chart supports both, so the
    requirement is worth knowing.

    Do not put real values in a .tfvars file committed to git. Source them from
    a secret manager with a data source, or pass them at apply time. See the
    README's note on state.
  EOT
  type        = map(string)
  sensitive   = true
}

variable "atomic" {
  description = <<-EOT
    Roll the release back if it fails to become ready. On for anything that
    matters: a partial upgrade leaves some pods on the new image and some on
    the old, against one database.
  EOT
  type        = bool
  default     = true
}

variable "timeout_seconds" {
  description = <<-EOT
    How long to wait for the release. The default is generous because the chart
    runs schema migrations as a pre-install hook and the Docling image loads
    its models before it reports ready.
  EOT
  type        = number
  default     = 900
}
