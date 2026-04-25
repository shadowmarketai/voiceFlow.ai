# resources/

Static assets and sample data for this project — brand files, sample CSVs, test fixtures, brochures, screenshots referenced by marketing/docs.

Empty on the template. Populate on fork with whatever the project needs.

## Suggested layout

```
resources/
├── brand/        # logos, icons, color palettes
├── samples/      # example input files for testing (CSVs, JSON, PDFs)
├── fixtures/     # test data committed to the repo (distinct from samples/)
└── screenshots/  # for README/docs
```

## Rules

- No secrets. If a file might contain credentials or API keys, it belongs in `.env` (gitignored).
- Large binaries (> 5 MB) should use Git LFS or an external store (S3/R2) referenced by URL.
- Keep sample CSVs / fixtures minimal — trim to the smallest row count that exercises the parser.
