---
title: 'Graph zoom labels need reprocessing, not only a redraw'
modules: ['web', 'brain']
areas: ['frontend', 'testing']
topics: ['brain', 'graph', 'sigma', 'zoom', 'labels']
---

# Graph zoom labels need reprocessing, not only a redraw

## Context

Brain hides full-graph labels when zoomed out, except for highlighted pages and their neighbours.

## Problem

Sigma's camera update listener schedules a render; node reducers run when node data is processed. Reading camera zoom inside the reducer alone leaves cached labels unchanged across a zoom threshold. Reading a renderer variable from the reducer during construction can also reach it before initialization.

## Rule

Keep the zoom ratio in a closure initialized before creating the renderer. Listen for camera updates, and refresh node processing when visibility crosses the threshold; clean up the listener with the renderer. Test both the reducer's output and the refresh caused by a camera update. Keep complete topic counts separate from the canvas node budget.

## Applies to

Brain graph label visibility and summaries above a budgeted visualization.
