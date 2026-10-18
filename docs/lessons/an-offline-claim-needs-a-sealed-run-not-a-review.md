---
title: 'An "it stays on the machine" claim needs a sealed run, not a review — seven services called home past every earlier check'
modules: ['infra', 'appliance']
areas: ['security', 'architecture']
topics: ['docker', 'compose', 'egress', 'telemetry', 'on-premises', 'offline', 'tcpdump', 'self-hosting']
---

# An "it stays on the machine" claim needs a sealed run, not a review — seven services called home past every earlier check

**In short**: the appliance had already passed three things: a code guard that model calls go through the route table, a review of every outbound integration, and 25 minutes of `lsof` sampling on the host. `npm run appliance:egress-check` then ran it on an `internal: true` network and watched the bridge. It found Qdrant, Prisma (twice), Ollama, Docling's Gradio UI, the Hugging Face Hub and onnxruntime all looking up third-party hosts, and an environment template that could not boot api or the worker. None of these is Ragen code, so no guard over Ragen code could see them. The only evidence is a packet on a network that has no way out, captured below the application.

**Context**: step A3 of the on-premises appliance spec. The earlier checks were real: A4's guard fails when a model id reaches a provider without the route table, and the 0.3 run sampled the host processes' sockets. Both looked at what Ragen does. The appliance also runs Qdrant, Postgres, Redis, Docling and Ollama, each with its own idea of what to send home.

**Problem**:

- **Telemetry lives in dependencies, and it is on by default.**
  - Qdrant posts to `telemetry.qdrant.io`.
  - Prisma's CLI and client check `checkpoint.prisma.io`, including the one-shot `migrate` job.
  - Ollama fetches cloud tags and model recommendations from `ollama.com` at start.
  - Docling's UI is Gradio, which sends analytics and fetches assets.
  - Docling asks `huggingface.co` even though its models are in the image.
  - onnxruntime 1.29's native library reports to `mobile.events.data.microsoft.com`.

  Each one has a switch, and none of them is off unless someone sets it.
- **A host-side socket sample misses all of this.** The calls come from containers, many are DNS lookups that fail before a socket opens, and most happen in the first seconds after start.
- **An environment template nobody booted in containers was wrong.** `appliance.env.example` listed three of the eight secrets create-ragen-app generates, and api and the worker restart-looped without the rest. The host-run demo had never read it, because a developer's own `.env.local` was used.
- **Two traps in the capture itself.**
  - Docker reuses a freed address within seconds. Without timestamps, the canary's attempts were blamed on the admin container that inherited its address. Attribute each packet by when it was sent, not by who holds the address at the end.
  - The resolver's behaviour decides whether a lookup is visible at all. On Docker 24, the embedded DNS forwards a name it does not own from the container onto the bridge. Docker 26 changed this for internal networks. A capture that sees nothing proves nothing, so the check runs a canary that must be seen.

**Rule**: a claim that something sends nothing off the machine is tested by running it on a network with no route out and capturing below the application, not by reviewing code or sampling sockets. Run it in a clean directory with the environment a real install gets, generated from the same manifest the installer uses. Make the check prove it can see — a canary — before it believes a clean result. Every switch it leads to goes in the compose file with a comment naming the host it stopped.

**Applies to**: `docker-compose.appliance.yml`, `infra/appliance/`, and any new service or dependency added to the appliance — run `npm run appliance:egress-check` after adding one. Also any "no telemetry" or "air-gapped" claim made in docs or release notes.
