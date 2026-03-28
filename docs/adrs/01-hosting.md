# ADR-01: Hosting Platform

**Status:** Accepted
**Date:** 2024-03-21

## Context

The application relies on Server-Sent Events (SSE) for streaming AI responses. The hosting platform must support long-lived SSE connections without premature termination.

## Options Evaluated

| Platform | SSE Behavior | Verdict |
|----------|-------------|---------|
| **Vercel** | Kills SSE endpoint after ~10s | Unusable for streaming |
| **Heroku** | Kills SSE endpoint after ~55s; causes duplicate requests — agent starts talking to itself | Unreliable |
| **Railway** | Packages app in Docker container; no SSE timeout issues | Works well |

## Decision

**Railway** — containerized deployment with no SSE connection limits. Proven stable for long-running streaming responses.
