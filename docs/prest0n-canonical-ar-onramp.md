# Prest0n Canonical Artifact On-Ramp (private Artifact Registry)

Goal: every Prest0n tenant VM installs ONE uniform, version-pinned fork build
instead of `npm install -g openclaw` from public npm.

## What is live (Phase 0, proven)

- Private npm AR repo: `us-central1 / openclaw-npm` (project tensile-tenure-453409-k3).
- Scoped package: `@prest0n/openclaw` (only `@prest0n` routes to AR; public deps stay on npm).
- First artifact published + install-verified: `@prest0n/openclaw@2026.5.6-canonical.0`
  (dist provenance fork `996b326`; binary runs; #32 embedding-fallback fields present).
- VM auth path proven: `gcloud auth print-access-token` (active SA `openclaw-vm-sa`)
  mints the AR npm bearer non-interactively. SA holds editor + storage.admin.

## Owner-gated steps (require `roles/owner` — NOT the VM SA `roles/editor`)

The VM SA can create the repo/SA and upload artifacts, but CANNOT `setIamPolicy`
or create WIF pools. Owner (`miles@kingdomstays.ai`) must run:

```bash
PROJ=tensile-tenure-453409-k3
PUB_SA="openclaw-artifact-publisher@${PROJ}.iam.gserviceaccount.com"  # already created (0 roles)

# 1. Least-privilege publish grant (repo-scoped, NOT project-wide)
gcloud artifacts repositories add-iam-policy-binding openclaw-npm \
  --location=us-central1 --project="$PROJ" \
  --member="serviceAccount:${PUB_SA}" --role="roles/artifactregistry.writer"

# 2. WIF pool + GitHub OIDC provider (keyless CI)
gcloud iam workload-identity-pools create prest0n-github \
  --location=global --project="$PROJ" --display-name="Prest0n GitHub OIDC"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --project="$PROJ" --workload-identity-pool=prest0n-github \
  --display-name="GitHub Actions" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='milesprest0/openclaw'"

# 3. Let the GitHub repo impersonate the publisher SA
PROJNUM=205360336037
gcloud iam service-accounts add-iam-policy-binding "$PUB_SA" --project="$PROJ" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJNUM}/locations/global/workloadIdentityPools/prest0n-github/attribute.repository/milesprest0/openclaw"
```

Then set repo secrets so `.github/workflows/prest0n-canonical-ar-publish.yml` activates:

- `PREST0N_WIF_PROVIDER` = `projects/205360336037/locations/global/workloadIdentityPools/prest0n-github/providers/github`
- `PREST0N_AR_PUBLISHER_SA` = `openclaw-artifact-publisher@tensile-tenure-453409-k3.iam.gserviceaccount.com`

## Phase 1 (consume side — gated on canonical-repo + co-versioning decision)

Repoint `functions/src/prest0nVm/bootstrap/bootstrap-account-vm.sh:203`
(`npm install -g openclaw`) to install `@prest0n/openclaw@<pinned>` from AR,
writing a tenant `.npmrc` that maps only `@prest0n` -> AR with a gcloud-minted token.
