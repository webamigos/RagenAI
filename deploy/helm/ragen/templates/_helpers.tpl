{{/*
Name helpers — the usual Helm shape.
*/}}
{{- define "ragen.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ragen.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "ragen.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{ include "ragen.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ragen.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ragen.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ragen.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ragen.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Name of the Secret the pods read from — either one this chart renders, or an
existing one supplied by the operator.
*/}}
{{- define "ragen.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "ragen.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Image reference for one app. Per-app `image.repository`/`image.tag` win;
otherwise the shared registry plus the chart's appVersion.
*/}}
{{- define "ragen.appImage" -}}
{{- $root := .root -}}
{{- $app := .app -}}
{{- $name := .name -}}
{{- $repo := default (printf "%s/ragen-%s" $root.Values.image.registry $name) (get $app.image "repository") -}}
{{- $tag := default (default $root.Chart.AppVersion $root.Values.image.tag) (get $app.image "tag") -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}

{{/*
In-cluster URLs for the bundled dependencies.

Each of these is only used when the operator left the matching `config` entry
empty. That is what makes "disable the bundled Postgres, point DATABASE_URL at
RDS" a one-line change rather than a fork of the chart.
*/}}
{{- define "ragen.postgresHost" -}}
{{- printf "%s-postgres" (include "ragen.fullname" .) -}}
{{- end -}}

{{- define "ragen.databaseUrl" -}}
{{- if .Values.config.DATABASE_URL -}}
{{- .Values.config.DATABASE_URL -}}
{{- else -}}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%v/%s" .Values.postgres.auth.username (include "ragen.postgresHost" .) .Values.postgres.port .Values.postgres.auth.database -}}
{{- end -}}
{{- end -}}

{{- define "ragen.qdrantUrl" -}}
{{- if .Values.config.QDRANT_URL -}}
{{- .Values.config.QDRANT_URL -}}
{{- else -}}
{{- printf "http://%s-qdrant:%v" (include "ragen.fullname" .) .Values.qdrant.port -}}
{{- end -}}
{{- end -}}

{{- define "ragen.redisUrl" -}}
{{- if .Values.config.REDIS_URL -}}
{{- .Values.config.REDIS_URL -}}
{{- else if .Values.redis.enabled -}}
{{- printf "redis://%s-redis:%v" (include "ragen.fullname" .) .Values.redis.port -}}
{{- end -}}
{{- end -}}

{{- define "ragen.litellmUrl" -}}
{{- if .Values.config.LITELLM_PROXY_URL -}}
{{- .Values.config.LITELLM_PROXY_URL -}}
{{- else -}}
{{- printf "http://%s-litellm:%v" (include "ragen.fullname" .) .Values.litellm.port -}}
{{- end -}}
{{- end -}}

{{- define "ragen.doclingUrl" -}}
{{- if .Values.config.DOCLING_URL -}}
{{- .Values.config.DOCLING_URL -}}
{{- else -}}
{{- printf "http://%s-docling:%v" (include "ragen.fullname" .) .Values.docling.port -}}
{{- end -}}
{{- end -}}

{{- /*
Presidio, same shape as the others: an operator-supplied URL wins, the bundled
service is the fallback. Without the config branch, disabling the bundled
Presidio and pointing `config.PRESIDIO_ANALYZER_URL` at an external one left
the variable unset entirely — the ConfigMap deliberately excludes these keys,
so this helper is the only thing that emits them.
*/}}
{{- define "ragen.presidioAnalyzerUrl" -}}
{{- if .Values.config.PRESIDIO_ANALYZER_URL -}}
{{- .Values.config.PRESIDIO_ANALYZER_URL -}}
{{- else if .Values.presidio.analyzer.enabled -}}
{{- printf "http://%s-presidio-analyzer:%v" (include "ragen.fullname" .) .Values.presidio.analyzer.port -}}
{{- end -}}
{{- end -}}

{{- define "ragen.presidioAnonymizerUrl" -}}
{{- if .Values.config.PRESIDIO_ANONYMIZER_URL -}}
{{- .Values.config.PRESIDIO_ANONYMIZER_URL -}}
{{- else if .Values.presidio.anonymizer.enabled -}}
{{- printf "http://%s-presidio-anonymizer:%v" (include "ragen.fullname" .) .Values.presidio.anonymizer.port -}}
{{- end -}}
{{- end -}}

{{- define "ragen.temporalAddress" -}}
{{- if .Values.config.TEMPORAL_SERVER_ADDRESS -}}
{{- .Values.config.TEMPORAL_SERVER_ADDRESS -}}
{{- else -}}
{{- printf "%s-temporal:%v" (include "ragen.fullname" .) .Values.temporal.port -}}
{{- end -}}
{{- end -}}

{{/*
Env shared by every app: the ConfigMap, the Secret, and the resolved
dependency URLs. POSTGRES_PASSWORD comes first so DATABASE_URL can interpolate
it — Kubernetes expands `$(VAR)` only against variables declared earlier.
*/}}
{{- define "ragen.appEnv" -}}
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "ragen.secretName" . }}
      key: POSTGRES_PASSWORD
- name: DATABASE_URL
  value: {{ include "ragen.databaseUrl" . | quote }}
- name: QDRANT_URL
  value: {{ include "ragen.qdrantUrl" . | quote }}
{{- with (include "ragen.redisUrl" .) }}
- name: REDIS_URL
  value: {{ . | quote }}
{{- end }}
- name: LITELLM_PROXY_URL
  value: {{ include "ragen.litellmUrl" . | quote }}
- name: DOCLING_URL
  value: {{ include "ragen.doclingUrl" . | quote }}
- name: TEMPORAL_SERVER_ADDRESS
  value: {{ include "ragen.temporalAddress" . | quote }}
{{- with (include "ragen.presidioAnalyzerUrl" .) }}
- name: PRESIDIO_ANALYZER_URL
  value: {{ . | quote }}
{{- end }}
{{- with (include "ragen.presidioAnonymizerUrl" .) }}
- name: PRESIDIO_ANONYMIZER_URL
  value: {{ . | quote }}
{{- end }}
{{- end -}}

{{/*
Secrets with no external owner: this chart generates them once and keeps them
across upgrades. Everything else in `.Values.secrets` names a third-party
provider and has to be supplied. Defined here because both the Secret and
NOTES.txt need the same list, and two copies of it would drift.
*/}}
{{- define "ragen.generatedSecretKeys" -}}
BETTER_AUTH_SECRET SECRET_KEY INTERNAL_API_SECRET SESSION_AUTH_SECRET WORKER_SECRET_KEY LITELLM_MASTER_KEY
{{- end -}}
