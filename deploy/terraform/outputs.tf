output "namespace" {
  description = "Namespace the release was deployed into."
  value       = kubernetes_namespace.ragen.metadata[0].name
}

output "release_name" {
  description = "Helm release name, which prefixes every object the chart created."
  value       = helm_release.ragen.name
}

output "secret_name" {
  description = "Secret the pods read from. Not its contents."
  value       = kubernetes_secret.ragen.metadata[0].name
}

output "port_forward_command" {
  description = "Reach the web app without an Ingress."
  value       = "kubectl port-forward -n ${kubernetes_namespace.ragen.metadata[0].name} svc/${helm_release.ragen.name}-web 3000:3000"
}
