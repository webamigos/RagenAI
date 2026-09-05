# A base image's own packaging can break your Dockerfile with zero changelog entry

**Context:** Presidio analyzer upgrade, `2.2.362` → `2.2.364`
([`docs/runbooks/presidio-upgrade.md`](../runbooks/presidio-upgrade.md)),
bundled with the Microsoft → Data Privacy Stack registry migration.

The Presidio Python package's own release notes for this range said "no
breaking changes" — correctly, for the library itself. But
`infra/presidio/analyzer/Dockerfile` builds `FROM` the upstream
`presidio-analyzer` image and overrides its `CMD` to run
`poetry run gunicorn -w ... "app:create_app()"`. The new base image had
switched its own internal packaging from Poetry to `uv` (installing
dependencies straight into the system Python via
`uv sync --locked --no-install-project` rather than a Poetry-managed venv) —
the `poetry` binary doesn't exist in the new image at all. The container
crash-looped with `poetry: not found`, found only by actually building and
running the new image, not by reading any release note (this change wasn't
in the Presidio project's changelog — it's an implementation detail of the
container image, not the Python package the changelog documents).

**Why:** a vendor's changelog documents changes to *their product's behavior*.
A custom `Dockerfile` that inherits `FROM` a vendor image and overrides its
`CMD`/`ENTRYPOINT` also inherits that image's internal packaging choices —
and those can change with zero mention anywhere a normal dependency-upgrade
review would look, because from the vendor's point of view it's an
implementation detail, not a public interface. This is a different failure
mode than the Docling upgrade's lesson on version-jump size (that one is
about the *size* of a version jump predicting risk; this one is about
changelogs not covering the layer you actually depend on at all) —
`docs/lessons/version-jump-size-doesnt-predict-breaking-risk.md`, landing in
the same upgrade effort's Docling PR.

**How to apply:** whenever a custom Dockerfile's `CMD`/`ENTRYPOINT` overrides
or otherwise depends on how a base image runs its own process (not just what
packages it exposes), actually build and run the new base image — including
checking its own default `entrypoint.sh`/`CMD` for how it now expects to be
invoked — before trusting that "no breaking changes in the changelog" means
the Dockerfile still works. Do this even for a small version bump; the
packaging change here happened between two patch versions.
