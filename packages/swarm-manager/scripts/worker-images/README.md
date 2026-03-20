# Worker Images

Each worker image workflow lives in its own folder.

- `build.sh` runs from a trusted control machine and orchestrates the AWS image build.
- `provision.sh` runs on the temporary builder EC2 and installs everything that should be baked into the resulting EC2 image.
- `Dockerfile` is included only when that worker type depends on a standard Docker image that should be built and cached into the EC2 image.

Current workflows:

- `bun-worker/`
- `browser-worker/`
