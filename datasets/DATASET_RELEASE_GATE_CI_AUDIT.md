# Dataset Release Gate — CI Audit Report

Audit date: 2026-11-27

## GitHub Actions evidence

* Dataset licence workflow run: https://github.com/tusharsingh-1801/91-CHM/actions/runs/45965241796
  * Commit: 4390e2fd58174c94eec0b082ba32140bbe9f05ac
  * Result: **success**
  * Job: `dataset-license-gate`
  * Steps: checkout, Python setup and `python scripts/check_dataset_licenses.py` all completed successfully.
* Main repository Validation workflow run: https://github.com/tusharsingh-1801/91-CHM/actions/runs/45965241771
  * Python engine job: success (requirements install, py_compile and pytest).
  * Main `validate` job: failed at `npm run test:research`.
  * Exact failure from log: `npm error Missing script: "test:research"`.
  * Earlier steps in that job passed: npm ci, migrations, scouting recovery tests, typecheck and npm test. Subsequent photos, integration, lint, build and browser tests were skipped.

## Interpretation

The dataset release-gate workflow itself passed on the inspected commit. This means the configured path-based checks found no matching restricted raw files in the Git index at that commit. It does **not** prove all tracked datasets have valid licences, image-level rights, correct attribution, or permission for commercial deployment.

The separate repository Validation workflow is not green. Its observed failure is a missing npm script named `test:research`; this report records the failure but does not modify package scripts because the intended research-test command/coverage has not been established.

## Remaining checks

1. Inspect the complete Git tree and inventory every tracked data file.
2. Compare each file to its exact source/version and rights evidence.
3. Verify required attribution and licence text for every approved dataset.
4. Decide how to handle the unrelated missing `test:research` script with the project maintainers.
5. Re-run both workflows after any fixes and retain the resulting evidence.

## Release decision

**Not cleared for a general public data release.** The licence gate CI passed, but this is a narrow path-based check and the main Validation workflow failed. Only the specific DES dataset version already recorded in the training register remains marked allowed with attribution; all other dataset decisions remain as stated in the register and third-party notices.


## Follow-up investigation: Validation workflow failure (2026-11-27)

The failed run's workflow path is `.github/workflows/ci.yml`. The failure is confirmed to be a configuration mismatch: this workflow invokes `npm run test:research`, but the inspected root `package.json` has no `test:research` script.

The repository's `scripts/ml/README.md` documents the intended research/model-comparison unit test command as:

```powershell
cd scripts/ml; ..\\..\\.venv\\Scripts\\python.exe -m unittest test_ml_pipeline
```

The corresponding test file is `scripts/ml/test_ml_pipeline.py`. It imports NumPy and project ML modules; the ML README points to `scripts/ml/requirements-ml.txt` for the dedicated ML environment. Therefore, simply renaming the npm command to an arbitrary command or silently deleting the test step would hide the missing CI coverage. A proper CI repair should add a Python setup/dependency-install step for the research test environment and invoke the documented unittest command from `scripts/ml`, or define an npm alias that does exactly that. This change was **not** made in this audit because the full dependency/runner setup has not yet been validated on GitHub Actions.

Relevant inspected files: `package.json` (no test:research script); `.github/workflows/ci.yml` (calls missing script); `scripts/ml/README.md` (documents unittest command); `scripts/ml/test_ml_pipeline.py` (actual research tests); `scripts/ml/requirements-ml.txt` (ML dependencies).
